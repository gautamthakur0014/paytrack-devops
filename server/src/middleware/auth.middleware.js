'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const protect = catchAsync(async (req, res, next) => {
  let token;

  // Check Authorization header first, then cookie
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    throw new AppError('Authentication required. Please login.', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Access token expired. Please refresh.', 401);
    }
    throw new AppError('Invalid access token', 401);
  }

  if (decoded.type !== 'access') {
    throw new AppError('Invalid token type', 401);
  }

  // Attach minimal user info from token — no DB hit on every request
  req.user = {
    id: decoded.sub,
    role: decoded.role || 'user',
    username: decoded.username,
    displayName: decoded.displayName,
  };

  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    throw new AppError('You do not have permission to perform this action', 403);
  }
  next();
};

module.exports = { protect, requireRole };
