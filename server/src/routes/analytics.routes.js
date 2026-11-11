'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Expense = require('../models/Expense.model');
const { cacheOrFetch } = require('../config/redis');
const { protect } = require('../middleware/auth.middleware');
const catchAsync = require('../utils/catchAsync');

router.use(protect);

// Overview: total spent, total owed, total receivable for a given period
router.get('/overview', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { year, month } = req.query;
  const cacheKey = `analytics:overview:${userId}:${year}:${month}`;

  const data = await cacheOrFetch(cacheKey, async () => {
    const matchFilter = {
      ownerId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    };

    if (year && month) {
      matchFilter.expenseDate = {
        $gte: new Date(year, month - 1, 1),
        $lte: new Date(year, month, 0, 23, 59, 59),
      };
    }

    const [totals, balance] = await Promise.all([
      Expense.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$totalAmount' },
            totalRecovered: { $sum: '$recoveredAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Expense.getBalanceSummary(userId),
    ]);

    return {
      totalSpent: totals[0]?.totalSpent || 0,
      totalRecovered: totals[0]?.totalRecovered || 0,
      expenseCount: totals[0]?.count || 0,
      youOwe: balance.youOwe,
      youReceive: balance.youReceive,
      netBalance: (balance.youReceive || 0) - (balance.youOwe || 0),
    };
  }, 120);

  res.status(200).json({ success: true, data });
}));

// Monthly spending over time (last N months)
router.get('/monthly-trend', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const months = parseInt(req.query.months) || 6;
  const cacheKey = `analytics:trend:${userId}:${months}`;

  const data = await cacheOrFetch(cacheKey, async () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const result = await Expense.aggregate([
      {
        $match: {
          ownerId: new mongoose.Types.ObjectId(userId),
          isDeleted: false,
          expenseDate: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$expenseDate' },
            month: { $month: '$expenseDate' },
          },
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    return result.map(r => ({
      year: r._id.year,
      month: r._id.month,
      total: r.total,
      count: r.count,
      label: new Date(r._id.year, r._id.month - 1).toLocaleString('default', {
        month: 'short', year: '2-digit',
      }),
    }));
  }, 300);

  res.status(200).json({ success: true, data });
}));

// Category breakdown
router.get('/categories', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { year, month } = req.query;
  const cacheKey = `analytics:categories:${userId}:${year}:${month}`;

  const data = await cacheOrFetch(cacheKey, async () => {
    const matchFilter = {
      ownerId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    };

    if (year && month) {
      matchFilter.expenseDate = {
        $gte: new Date(year, month - 1, 1),
        $lte: new Date(year, month, 0, 23, 59, 59),
      };
    }

    return Expense.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);
  }, 300);

  res.status(200).json({ success: true, data });
}));

// Member debts: what each connected member owes you (or you owe them)
router.get('/member-debts', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `analytics:member-debts:${userId}`;

  const data = await cacheOrFetch(cacheKey, async () => {
    const expenses = await Expense.find({
      isDeleted: false,
      type: { $ne: 'individual' },
      $or: [
        { ownerId: new mongoose.Types.ObjectId(userId) },
        { 'members.userId': new mongoose.Types.ObjectId(userId) },
      ],
    })
      .populate('ownerId', 'username displayName avatarColor')
      .populate('members.userId', 'username displayName avatarColor')
      .lean();

    // Map: memberId -> { user info, totalOwed, totalPaid }
    const debtMap = {};

    expenses.forEach(exp => {
      const ownerId = exp.ownerId._id?.toString() || exp.ownerId.toString();
      const isOwner = ownerId === userId;

      exp.members.forEach(m => {
        const memberId = m.userId?._id?.toString() || m.userId?.toString();
        if (!memberId) return;

        if (isOwner && memberId !== userId) {
          // This member owes the current user
          if (!debtMap[memberId]) {
            debtMap[memberId] = {
              user: m.userId,
              theyOweYou: 0,
              youOweThem: 0,
            };
          }
          if (m.status !== 'paid') {
            debtMap[memberId].theyOweYou += m.amount || 0;
          }
        } else if (!isOwner && memberId === userId) {
          // Current user owes the owner
          if (!debtMap[ownerId]) {
            debtMap[ownerId] = {
              user: exp.ownerId,
              theyOweYou: 0,
              youOweThem: 0,
            };
          }
          if (m.status !== 'paid') {
            debtMap[ownerId].youOweThem += m.amount || 0;
          }
        }
      });
    });

    return Object.values(debtMap).map(entry => ({
      ...entry,
      netBalance: entry.theyOweYou - entry.youOweThem,
    }));
  }, 120);

  res.status(200).json({ success: true, data });
}));

// Settlement suggestions (minimise transactions algorithm)
router.get('/settlement-suggestions', catchAsync(async (req, res) => {
  const userId = req.user.id;

  const expenses = await Expense.find({
    isDeleted: false,
    type: { $ne: 'individual' },
    $or: [
      { ownerId: new mongoose.Types.ObjectId(userId) },
      { 'members.userId': new mongoose.Types.ObjectId(userId) },
    ],
  }).lean();

  const balances = {};

  expenses.forEach(exp => {
    const ownerId = exp.ownerId.toString();
    exp.members.forEach(m => {
      if (m.status === 'paid') return;
      const memberId = m.userId.toString();
      balances[ownerId] = (balances[ownerId] || 0) + m.amount;
      balances[memberId] = (balances[memberId] || 0) - m.amount;
    });
  });

  const creditors = Object.entries(balances).filter(([, v]) => v > 0).map(([id, amount]) => ({ id, amount }));
  const debtors = Object.entries(balances).filter(([, v]) => v < 0).map(([id, amount]) => ({ id, amount: -amount }));

  const transactions = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const settle = Math.min(creditors[i].amount, debtors[j].amount);
    transactions.push({ from: debtors[j].id, to: creditors[i].id, amount: settle });
    creditors[i].amount -= settle;
    debtors[j].amount -= settle;
    if (creditors[i].amount < 0.01) i++;
    if (debtors[j].amount < 0.01) j++;
  }

  res.status(200).json({ success: true, data: { transactions, balances } });
}));

module.exports = router;
