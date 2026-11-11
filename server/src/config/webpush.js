'use strict';

const webpush = require('web-push');
const logger = require('./logger');

// ─── Validate VAPID key format ────────────────────────────────────────────────
function validateVapidKey(key, name) {
  if (!key || typeof key !== 'string') {
    return `${name} is missing`;
  }
  const clean = key.trim();
  // URL-safe base64 chars only
  if (!/^[A-Za-z0-9\-_]+$/.test(clean)) {
    return `${name} contains invalid characters (must be URL-safe base64)`;
  }
  // VAPID public key decoded is 65 bytes → encoded is 87 chars (no padding)
  // VAPID private key decoded is 32 bytes → encoded is 43 chars (no padding)
  if (name === 'VAPID_PUBLIC_KEY' && clean.length !== 87) {
    return `${name} has wrong length (${clean.length} chars, expected 87). Regenerate with: node scripts/generate-vapid-keys.js`;
  }
  if (name === 'VAPID_PRIVATE_KEY' && clean.length !== 43) {
    return `${name} has wrong length (${clean.length} chars, expected 43). Regenerate with: node scripts/generate-vapid-keys.js`;
  }
  return null;
}

let pushEnabled = false;

function initWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!pub && !priv) {
    logger.warn('VAPID keys not set — web push notifications disabled. Run: node scripts/generate-vapid-keys.js');
    return;
  }

  // Validate each key
  const errors = [
    validateVapidKey(pub, 'VAPID_PUBLIC_KEY'),
    validateVapidKey(priv, 'VAPID_PRIVATE_KEY'),
    !subject ? 'VAPID_SUBJECT is missing (use mailto:you@example.com)' : null,
  ].filter(Boolean);

  if (errors.length > 0) {
    logger.error('VAPID configuration errors — push notifications disabled:');
    errors.forEach(e => logger.error(`  ✗ ${e}`));
    logger.error('Fix: run  node scripts/generate-vapid-keys.js  and update .env');
    return;
  }

  try {
    webpush.setVapidDetails(subject.trim(), pub.trim(), priv.trim());
    pushEnabled = true;
    logger.info('Web Push (VAPID) initialised ✓');
  } catch (err) {
    logger.error(`VAPID init failed: ${err.message}`);
    logger.error('Make sure your keys were generated with web-push, not manually created.');
  }
}

// ─── Send a push notification ─────────────────────────────────────────────────
async function sendPushNotification(subscription, payload) {
  if (!pushEnabled) return { success: false, disabled: true };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    // 410 Gone / 404 Not Found = subscription expired on push service side
    if (err.statusCode === 410 || err.statusCode === 404) {
      return { success: false, expired: true };
    }
    logger.error('Push notification send error:', err.message);
    return { success: false, error: err.message };
  }
}

function isPushEnabled() {
  return pushEnabled;
}

module.exports = { initWebPush, sendPushNotification, isPushEnabled };
