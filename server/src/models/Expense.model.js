'use strict';

const mongoose = require('mongoose');

// ─── Member Schema (embedded) ─────────────────────────────────────────────────
const memberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  username: String,
  displayName: String,
  avatar: String,
  avatarColor: String,
  // Amount this member owes
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  // Payment lifecycle
  status: {
    type: String,
    enum: ['added', 'notified', 'paid'],
    default: 'added',
  },
  notifiedAt: Date,
  paidAt: Date,
  // For custom splits
  splitType: {
    type: String,
    enum: ['equal', 'custom', 'percentage'],
    default: 'equal',
  },
  splitValue: Number, // percentage or custom amount input
}, { _id: true });

// ─── Expense Schema ───────────────────────────────────────────────────────────
const expenseSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['individual', 'equal_group', 'custom_group'],
    required: true,
    default: 'individual',
    index: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [200, 'Description too long'],
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be positive'],
  },
  currency: {
    type: String,
    default: 'USD',
    length: 3,
  },
  category: {
    type: String,
    enum: ['food', 'travel', 'rent', 'utilities', 'entertainment', 'health', 'shopping', 'other'],
    default: 'other',
    index: true,
  },
  customCategory: String,
  expenseDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  // Group context
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null,
    index: true,
  },
  // Members (for group expenses)
  members: {
    type: [memberSchema],
    default: [],
  },
  // Recovery tracking
  totalAmount: {
    type: Number,
    required: true,
  },
  recoveredAmount: {
    type: Number,
    default: 0,
  },
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: Date,
  // Offline sync tracking
  localId: {
    type: String, // UUID from offline client
    index: true,
    sparse: true,
  },
  syncedAt: Date,
  notes: {
    type: String,
    maxlength: 500,
    trim: true,
  },
  // Receipt / attachment
  attachmentUrl: String,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ─── Virtuals ─────────────────────────────────────────────────────────────────
expenseSchema.virtual('pendingAmount').get(function () {
  return this.totalAmount - this.recoveredAmount;
});

expenseSchema.virtual('isFullySettled').get(function () {
  return this.recoveredAmount >= this.totalAmount;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
expenseSchema.index({ ownerId: 1, expenseDate: -1 });
expenseSchema.index({ ownerId: 1, type: 1, expenseDate: -1 });
expenseSchema.index({ ownerId: 1, category: 1 });
expenseSchema.index({ 'members.userId': 1 });
expenseSchema.index({ groupId: 1, expenseDate: -1 });
expenseSchema.index({ localId: 1, ownerId: 1 }, { sparse: true });

// ─── Statics ──────────────────────────────────────────────────────────────────
expenseSchema.statics.getMonthlyTotal = async function (userId, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const result = await this.aggregate([
    {
      $match: {
        ownerId: new mongoose.Types.ObjectId(userId),
        expenseDate: { $gte: start, $lte: end },
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$totalAmount' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result[0] || { total: 0, count: 0 };
};

expenseSchema.statics.getBalanceSummary = async function (userId) {
  const result = await this.aggregate([
    {
      $match: {
        isDeleted: false,
        $or: [
          { ownerId: new mongoose.Types.ObjectId(userId) },
          { 'members.userId': new mongoose.Types.ObjectId(userId) },
        ],
      },
    },
    { $unwind: { path: '$members', preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        youOwe: [
          {
            $match: {
              'members.userId': new mongoose.Types.ObjectId(userId),
              'members.status': { $ne: 'paid' },
            },
          },
          { $group: { _id: null, total: { $sum: '$members.amount' } } },
        ],
        youReceive: [
          {
            $match: {
              ownerId: new mongoose.Types.ObjectId(userId),
              'members.status': { $ne: 'paid' },
            },
          },
          { $group: { _id: null, total: { $sum: '$members.amount' } } },
        ],
      },
    },
  ]);

  const data = result[0];
  return {
    youOwe: data.youOwe[0]?.total || 0,
    youReceive: data.youReceive[0]?.total || 0,
  };
};

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
