'use strict';

const Redis = require('ioredis');
const logger = require('./logger');

let client = null;
let subscriber = null;
let publisher = null;

const REDIS_OPTIONS = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis retry attempt ${times}, reconnecting in ${delay}ms`);
    return delay;
  },
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    if (targetErrors.some(e => err.message.includes(e))) return true;
    return false;
  },
};

async function connectRedis() {
  try {
    client = new Redis(process.env.REDIS_URL, REDIS_OPTIONS);
    publisher = new Redis(process.env.REDIS_URL, REDIS_OPTIONS);
    subscriber = new Redis(process.env.REDIS_URL, REDIS_OPTIONS);

    await client.ping();
    logger.info('Redis connected successfully');

    client.on('error', err => logger.error('Redis client error:', err.message));
    client.on('reconnecting', () => logger.warn('Redis reconnecting...'));
  } catch (err) {
    logger.error('Redis connection failed:', err.message);
    throw err;
  }
}

function getClient() {
  if (!client) throw new Error('Redis not initialised. Call connectRedis() first.');
  return client;
}

function getPublisher() {
  if (!publisher) throw new Error('Redis publisher not initialised.');
  return publisher;
}

function getSubscriber() {
  if (!subscriber) throw new Error('Redis subscriber not initialised.');
  return subscriber;
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

/**
 * Get cached value or execute factory and cache result.
 * @param {string} key
 * @param {() => Promise<any>} factory
 * @param {number} ttlSeconds
 */
async function cacheOrFetch(key, factory, ttlSeconds = 300) {
  const redis = getClient();
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  const value = await factory();
  if (value !== null && value !== undefined) {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  }
  return value;
}

async function invalidatePattern(pattern) {
  const redis = getClient();
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

async function setWithTTL(key, value, ttlSeconds) {
  const redis = getClient();
  return redis.setex(key, ttlSeconds, JSON.stringify(value));
}

async function getValue(key) {
  const redis = getClient();
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
}

async function deleteKey(key) {
  const redis = getClient();
  return redis.del(key);
}

module.exports = {
  connectRedis,
  getClient,
  getPublisher,
  getSubscriber,
  cacheOrFetch,
  invalidatePattern,
  setWithTTL,
  getValue,
  deleteKey,
};
