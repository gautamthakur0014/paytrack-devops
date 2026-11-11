'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const { setWithTTL, getValue, deleteKey } = require('../config/redis');
const { sendOtpEmail } = require('../services/email.service');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const catchAsync = require('../utils/catchAsync');

// ─── Token Generation ─────────────────────────────────────────────────────────
function generateAccessToken(userId, role) {
  return jwt.sign(
    { sub: userId, role, type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
}

function generateRefreshToken(userId, family) {
  return jwt.sign(
    { sub: userId, family, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
}

function setCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth/refresh',
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────
exports.register = catchAsync(async (req, res) => {
  const { email, username, password, displayName } = req.body;

  const exists = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
  });

  if (exists) {
    const field = exists.email === email.toLowerCase() ? 'email' : 'username';
    throw new AppError(`${field} already in use`, 409);
  }

  const user = await User.create({
    email: email.toLowerCase(),
    username: username.toLowerCase(),
    password,
    displayName: displayName || username,
    avatarColor: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
  });

  const family = uuidv4();
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, family);

  await setWithTTL(`rt:${user._id}:${family}`, refreshToken, 7 * 24 * 3600);

  setCookies(res, accessToken, refreshToken);

  logger.info(`New user registered: ${user.username}`);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: { user: user.getPublicProfile(), accessToken },
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('Account has been deactivated', 403);
  }

  const family = uuidv4();
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, family);

  await setWithTTL(`rt:${user._id}:${family}`, refreshToken, 7 * 24 * 3600);

  await User.updateOne({ _id: user._id }, { lastSeen: new Date() });

  setCookies(res, accessToken, refreshToken);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: { user: user.getPublicProfile(), accessToken },
  });
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
exports.refresh = catchAsync(async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) throw new AppError('No refresh token', 401);

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const stored = await getValue(`rt:${decoded.sub}:${decoded.family}`);
  if (!stored || stored !== token) {
    // Token reuse detected — invalidate the family
    await deleteKey(`rt:${decoded.sub}:${decoded.family}`);
    throw new AppError('Token reuse detected. Please login again.', 401);
  }

  const user = await User.findById(decoded.sub);
  if (!user || !user.isActive) throw new AppError('User not found or inactive', 401);

  // Rotate tokens
  const newFamily = uuidv4();
  const newAccess = generateAccessToken(user._id, user.role);
  const newRefresh = generateRefreshToken(user._id, newFamily);

  await deleteKey(`rt:${decoded.sub}:${decoded.family}`);
  await setWithTTL(`rt:${user._id}:${newFamily}`, newRefresh, 7 * 24 * 3600);

  setCookies(res, newAccess, newRefresh);

  res.status(200).json({
    success: true,
    data: { accessToken: newAccess },
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = catchAsync(async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      await deleteKey(`rt:${decoded.sub}:${decoded.family}`);
    } catch (_) { /* ignore */ }
  }

  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });

  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  // Always respond 200 to prevent email enumeration
  if (!user) {
    return res.status(200).json({ success: true, message: 'If that email exists, an OTP was sent.' });
  }

  // Rate limit: 1 OTP per 60 seconds
  const cooldownKey = `otp:cooldown:${user._id}`;
  const cooldown = await getValue(cooldownKey);
  if (cooldown) {
    throw new AppError('Please wait 60 seconds before requesting another OTP', 429);
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  await setWithTTL(`otp:reset:${user._id}`, JSON.stringify({ hash: otpHash, attempts: 0 }), 600);
  await setWithTTL(cooldownKey, '1', 60);

  await sendOtpEmail(user.email, user.displayName || user.username, otp);

  logger.info(`Password reset OTP sent to: ${user.email}`);

  res.status(200).json({ success: true, message: 'OTP sent to email', userId: user._id });
});

// ─── Verify OTP ───────────────────────────────────────────────────────────────
exports.verifyOtp = catchAsync(async (req, res) => {
  const { userId, otp } = req.body;

  const otpKey = `otp:reset:${userId}`;
  const stored = await getValue(otpKey);
  if (!stored) throw new AppError('OTP expired or not found', 400);

  const { hash, attempts } = JSON.parse(stored);

  if (attempts >= 5) {
    await deleteKey(otpKey);
    throw new AppError('Too many failed attempts. Request a new OTP.', 400);
  }

  const inputHash = crypto.createHash('sha256').update(otp.toString()).digest('hex');

  if (inputHash !== hash) {
    await setWithTTL(otpKey, JSON.stringify({ hash, attempts: attempts + 1 }), 600);
    throw new AppError(`Invalid OTP. ${4 - attempts} attempts remaining.`, 400);
  }

  // OTP verified — issue short-lived reset token
  const resetToken = uuidv4();
  await setWithTTL(`otp:verified:${userId}`, resetToken, 300); // 5 min
  await deleteKey(otpKey);

  res.status(200).json({ success: true, resetToken });
});

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = catchAsync(async (req, res) => {
  const { userId, resetToken, newPassword } = req.body;

  const stored = await getValue(`otp:verified:${userId}`);
  if (!stored || stored !== resetToken) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  user.password = newPassword;
  await user.save();

  await deleteKey(`otp:verified:${userId}`);

  logger.info(`Password reset successful for user: ${user.username}`);

  res.status(200).json({ success: true, message: 'Password reset successful' });
});

// ─── Get Current User ─────────────────────────────────────────────────────────
exports.me = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('User not found', 404);

  res.status(200).json({
    success: true,
    data: { user: user.getPublicProfile() },
  });
});
