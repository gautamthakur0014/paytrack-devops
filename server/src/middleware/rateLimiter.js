'use strict';

const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

function smartKey(req) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      if (decoded?.sub) return `user:${decoded.sub}`;
    }
  } catch (_) {}
  return `ip:${req.ip}`;
}

function ipKey(req) {
  return `ip:${req.ip}`;
}

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

const global = rateLimit({
  windowMs: WINDOW_MS,
  max: (req) => {
    try {
      const header = req.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        jwt.verify(header.split(' ')[1], process.env.JWT_ACCESS_SECRET);
        return parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 500;
      }
    } catch (_) {}
    return parseInt(process.env.RATE_LIMIT_MAX) || 100;
  },
  keyGenerator: smartKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

const auth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts. Try again in 15 minutes.' },
});

const strict = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: smartKey,
  message: { success: false, message: 'Rate limit exceeded. Please slow down.' },
});

module.exports = { global, auth, strict };
