'use strict';

const express = require('express');
const router = express.Router();
const User = require('../models/User.model');
const { protect } = require('../middleware/auth.middleware');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

router.use(protect);

// Search users (for connection requests)
router.get('/search', catchAsync(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ success: true, data: [] });

  const users = await User.find({
    $or: [
      { username: { $regex: q, $options: 'i' } },
      { displayName: { $regex: q, $options: 'i' } },
    ],
    isActive: true,
    _id: { $ne: req.user.id },
  })
    .select('username displayName avatar avatarColor')
    .limit(10)
    .lean();

  res.json({ success: true, data: users });
}));

// Get own profile
router.get('/profile', catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, data: { user: user.getPublicProfile() } });
}));

// Update profile — now includes monthlyIncome
router.patch('/profile', catchAsync(async (req, res) => {
  const allowed = ['displayName', 'email', 'currency', 'timezone', 'avatarColor', 'monthlyIncome'];
  const updates = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  // Validate monthlyIncome if provided
  if (updates.monthlyIncome !== undefined) {
    const val = parseFloat(updates.monthlyIncome);
    if (isNaN(val) || val < 0) {
      throw new AppError('monthlyIncome must be a non-negative number', 400);
    }
    updates.monthlyIncome = val;
  }

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  });
  res.json({ success: true, data: { user: user.getPublicProfile() } });
}));

// Change password
router.patch('/change-password', catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new AppError('oldPassword and newPassword are required', 400);
  }
  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters', 400);
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const isMatch = await user.comparePassword(oldPassword);
  if (!isMatch) throw new AppError('Current password is incorrect', 401);

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password changed successfully' });
}));

// Delete account (soft delete)
router.delete('/account', catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { isActive: false });
  res.json({ success: true, message: 'Account deleted successfully' });
}));

// Register push subscription
router.post('/push-subscription', catchAsync(async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) throw new AppError('Invalid subscription', 400);

  await User.updateOne(
    { _id: req.user.id, 'pushSubscriptions.endpoint': { $ne: subscription.endpoint } },
    { $push: { pushSubscriptions: subscription } }
  );

  res.json({ success: true, message: 'Push subscription registered' });
}));

// Remove push subscription
router.delete('/push-subscription', catchAsync(async (req, res) => {
  const { endpoint } = req.body;
  await User.updateOne({ _id: req.user.id }, { $pull: { pushSubscriptions: { endpoint } } });
  res.json({ success: true });
}));

module.exports = router;
