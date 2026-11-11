'use strict';

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const { sendPushNotification } = require('../config/webpush');
const logger = require('../config/logger');

/**
 * Create a DB notification record AND immediately fire push notifications.
 *
 * Previous bug: push was only enqueued to Redis and the queue was never
 * drained, so push notifications were silently dropped.
 *
 * Fix: after saving the Notification document we call sendDirectPush()
 * right away (fire-and-forget). Redis queue is kept as an optional
 * secondary delivery channel if it is available, but we no longer
 * depend on it for delivery.
 */
async function createNotification({ recipientId, senderId, type, title, body, data = {} }) {
  // 1. Persist to DB
  const notification = await Notification.create({
    recipientId,
    senderId,
    type,
    title,
    body,
    data,
  });

  // 2. Fire push immediately — do not await so the caller is not blocked
  sendDirectPush(recipientId, { title, body, data: { ...data, url: '/notifications' } })
    .catch(err => logger.warn('[Push] Direct push error:', err.message));

  // 3. Also try to enqueue to Redis as a secondary delivery (optional)
  try {
    const { getClient } = require('../config/redis');
    const redis = getClient();
    if (redis) {
      await redis.rpush('push:queue', JSON.stringify({
        recipientId: recipientId.toString(),
        notificationId: notification._id.toString(),
        title,
        body,
        data,
      }));
    }
  } catch {
    // Redis unavailable — push already sent directly above, so this is fine
  }

  return notification;
}

/**
 * Send a web push notification to every active subscription of a user.
 * Automatically removes expired subscriptions from the user document.
 */
async function sendDirectPush(userId, payload) {
  try {
    const user = await User.findById(userId).select('pushSubscriptions').lean();
    if (!user?.pushSubscriptions?.length) return;

    const results = await Promise.allSettled(
      user.pushSubscriptions.map(sub => sendPushNotification(sub, payload))
    );

    // Collect endpoints whose subscription has expired on the push service
    const expiredEndpoints = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value?.expired) {
        expiredEndpoints.push(user.pushSubscriptions[i].endpoint);
      }
    });

    // Clean up expired subscriptions in one DB write
    if (expiredEndpoints.length > 0) {
      await User.updateOne(
        { _id: userId },
        { $pull: { pushSubscriptions: { endpoint: { $in: expiredEndpoints } } } }
      );
      logger.info(`[Push] Removed ${expiredEndpoints.length} expired subscription(s) for user ${userId}`);
    }
  } catch (err) {
    logger.error('[Push] sendDirectPush failed:', err.message);
  }
}

/**
 * Send payment-request push notifications to multiple expense members.
 * Called by the notifyMembers controller action.
 */
async function sendBulkPaymentRequest(expense, members, requester) {
  const notifications = members.map(member =>
    createNotification({
      recipientId: member.userId._id || member.userId,
      senderId:    requester.id,
      type:        'payment_request',
      title:       '💰 Payment Request',
      body:        `${requester.displayName || requester.username} is requesting ${expense.currency} ${member.amount} for "${expense.description}"`,
      data: {
        expenseId: expense._id.toString(),
        amount:    member.amount,
        currency:  expense.currency,
        url:       '/notifications',
      },
    })
  );

  return Promise.allSettled(notifications);
}

module.exports = { createNotification, sendDirectPush, sendBulkPaymentRequest };
