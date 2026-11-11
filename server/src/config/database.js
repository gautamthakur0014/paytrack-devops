'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');

const MONGO_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
};

let isConnected = false;

async function connectMongo() {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error', err => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected, attempting reconnect...');
      isConnected = false;
      setTimeout(connectMongo, 5000);
    });
  } catch (err) {
    logger.error('MongoDB initial connection failed:', err.message);
    throw err;
  }
}

function disconnectMongo() {
  return mongoose.connection.close();
}

module.exports = { connectMongo, disconnectMongo };
