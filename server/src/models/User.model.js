'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    index: true,
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username must not exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'],
    index: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false,
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: 60,
  },
  avatar: {
    type: String,
    default: null,
  },
  avatarColor: {
    type: String,
    default: '#10b981',
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  resetOtp: { type: String, select: false },
  resetOtpExpiry: { type: Date, select: false },
  resetOtpAttempts: { type: Number, default: 0, select: false },
  refreshTokenFamily: { type: String, select: false },
  pushSubscriptions: { type: [pushSubscriptionSchema], default: [] },
  currency: { type: String, default: 'USD' },
  timezone: { type: String, default: 'UTC' },
  lastSeen: { type: Date, default: Date.now },

  // ── Monthly income for budget tracking ──────────────────────────────────
  monthlyIncome: {
    type: Number,
    default: 0,
    min: [0, 'Monthly income cannot be negative'],
  },
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.password;
      delete ret.resetOtp;
      delete ret.resetOtpExpiry;
      delete ret.resetOtpAttempts;
      delete ret.refreshTokenFamily;
      return ret;
    },
  },
});

userSchema.index({ createdAt: -1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.getPublicProfile = function () {
  return {
    _id: this._id,
    email: this.email,
    username: this.username,
    displayName: this.displayName || this.username,
    avatar: this.avatar,
    avatarColor: this.avatarColor,
    currency: this.currency,
    timezone: this.timezone,
    role: this.role,
    isEmailVerified: this.isEmailVerified,
    lastSeen: this.lastSeen,
    createdAt: this.createdAt,
    monthlyIncome: this.monthlyIncome || 0,  // ← expose income
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
