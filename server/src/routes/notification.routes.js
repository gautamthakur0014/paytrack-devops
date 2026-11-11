'use strict';

const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const { protect } = require('../middleware/auth.middleware');
const { isPushEnabled } = require('../config/webpush');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// ── Public endpoints (no auth needed) ────────────────────────────────────────

// Returns VAPID public key + whether push is configured.
// Frontend calls this to decide whether to attempt subscription.
router.get('/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  const enabled = isPushEnabled();

  if (!enabled || !key) {
    return res.status(503).json({
      success: false,
      message: 'Push notifications not configured on this server',
    });
  }

  res.json({ success: true, data: { vapidPublicKey: key } });
});

// ── Protected endpoints ───────────────────────────────────────────────────────
router.use(protect);

// List notifications
router.get('/', catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [notifications, total, unread] = await Promise.all([
    Notification.find({ recipientId: req.user.id })
      .populate('senderId', 'username displayName avatar avatarColor')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Notification.countDocuments({ recipientId: req.user.id }),
    Notification.countDocuments({ recipientId: req.user.id, isRead: false }),
  ]);

  res.json({
    success: true,
    data: { notifications, total, unread, hasMore: skip + notifications.length < total },
  });
}));

// Mark all as read
router.patch('/read-all', catchAsync(async (req, res) => {
  await Notification.updateMany(
    { recipientId: req.user.id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.json({ success: true });
}));

// Mark single as read
router.patch('/:id/read', catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user.id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw new AppError('Notification not found', 404);
  res.json({ success: true, data: { notification } });
}));

// Delete a notification
router.delete('/:id', catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipientId: req.user.id,
  });
  if (!notification) throw new AppError('Notification not found', 404);
  res.json({ success: true });
}));

// Subscribe to push (save PushSubscription)
router.post('/subscribe', catchAsync(async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new AppError('Invalid push subscription object — missing endpoint or keys', 400);
  }

  await User.updateOne(
    { _id: req.user.id, 'pushSubscriptions.endpoint': { $ne: subscription.endpoint } },
    { $push: { pushSubscriptions: subscription } }
  );

  res.json({ success: true, message: 'Subscribed to push notifications' });
}));

// Unsubscribe from push
router.delete('/subscribe', catchAsync(async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) throw new AppError('endpoint is required', 400);
  await User.updateOne({ _id: req.user.id }, { $pull: { pushSubscriptions: { endpoint } } });
  res.json({ success: true });
}));

module.exports = router;
