'use strict';

const mongoose = require('mongoose');
const Expense = require('../models/Expense.model');
const Connection = require('../models/Connection.model');
const User = require('../models/User.model');
const { cacheOrFetch, invalidatePattern } = require('../config/redis');
const { createNotification, sendBulkPaymentRequest } = require('../services/notification.service');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');

const EXPENSES_PER_PAGE = 15;

const cacheKeys = {
  expenses:     (userId, query) => `expenses:${userId}:${JSON.stringify(query)}`,
  balance:      (userId)        => `balance:${userId}`,
  monthlyTotal: (userId, y, m)  => `monthly:${userId}:${y}:${m}`,
};

async function invalidateUserCaches(userId) {
  await Promise.all([
    invalidatePattern(`expenses:${userId}:*`),
    invalidatePattern(`balance:${userId}`),
    invalidatePattern(`monthly:${userId}:*`),
    invalidatePattern(`analytics:*:${userId}*`),
  ]);
}

// ─── List expenses ────────────────────────────────────────────────────────────
exports.listExpenses = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    month, year, type, category,
    page  = 1,
    limit = EXPENSES_PER_PAGE,
    search,
    // New: ISO date strings for an explicit date range
    startDate,
    endDate,
  } = req.query;

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const ownerOrMember = {
    isDeleted: false,
    $or: [
      { ownerId:          userObjectId },
      { 'members.userId': userObjectId },
    ],
  };

  // ── Date filter — range takes priority over month+year ──────────────────
  if (startDate && endDate) {
    ownerOrMember.expenseDate = {
      $gte: new Date(startDate),
      $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
    };
  } else if (month && year) {
    ownerOrMember.expenseDate = {
      $gte: new Date(year, month - 1, 1),
      $lte: new Date(year, month, 0, 23, 59, 59),
    };
  }

  if (type && ['individual', 'equal_group', 'custom_group'].includes(type)) {
    ownerOrMember.type = type;
  }
  if (category) ownerOrMember.category = category;
  if (search)   ownerOrMember.description = { $regex: search, $options: 'i' };

  const skip     = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = cacheKeys.expenses(userId, { ownerOrMember, skip, limit });

  const result = await cacheOrFetch(cacheKey, async () => {
    const [expenses, total] = await Promise.all([
      Expense.find(ownerOrMember)
        .sort({ expenseDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('members.userId', 'username displayName avatar avatarColor')
        .populate('groupId', 'name avatarColor')
        .lean(),
      Expense.countDocuments(ownerOrMember),
    ]);

    return {
      expenses,
      pagination: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        hasMore:    skip + expenses.length < total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    };
  }, 60);

  res.status(200).json({ success: true, data: result });
});

// ─── Create expense ───────────────────────────────────────────────────────────
exports.createExpense = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    type, description, amount, currency, category, customCategory,
    expenseDate, groupId, members, notes, localId,
  } = req.body;

  let processedMembers = [];
  if (members && members.length > 0 && type !== 'individual') {
    // Exclude the owner themselves from the member list
    const memberIds = members
      .map(m => m.userId)
      .filter(id => id && id.toString() !== userId.toString());

    const connectionChecks = await Promise.all(
      memberIds.map(id => Connection.areConnected(userId, id))
    );
    const invalidMembers = memberIds.filter((_, idx) => !connectionChecks[idx]);
    if (invalidMembers.length > 0) {
      throw new AppError('You must be connected with all expense members', 400);
    }

    const memberUsers = await User.find({ _id: { $in: memberIds } })
      .select('username displayName avatar avatarColor')
      .lean();
    const memberMap = Object.fromEntries(memberUsers.map(u => [u._id.toString(), u]));

    processedMembers = memberIds.map(mid => {
      const m    = members.find(x => x.userId === mid || x.userId?.toString() === mid);
      const user = memberMap[mid];
      let memberAmount = parseFloat(m?.amount) || 0;
      if (type === 'equal_group') {
        memberAmount = parseFloat((amount / (memberIds.length + 1)).toFixed(2));
      }
      return {
        userId:      mid,
        username:    user?.username,
        displayName: user?.displayName || user?.username,
        avatar:      user?.avatar,
        avatarColor: user?.avatarColor,
        amount:      memberAmount,
        status:      'added',
        splitType:   type === 'equal_group' ? 'equal' : 'custom',
        splitValue:  m?.splitValue,
      };
    });
  }

  if (localId) {
    const existing = await Expense.findOne({ localId, ownerId: userId });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Expense already exists (idempotent)',
        data: { expense: existing },
      });
    }
  }

  const expense = await Expense.create({
    ownerId: userId, type, description,
    amount:          parseFloat(amount),
    currency:        currency || 'USD',
    category:        category || 'other',
    customCategory,
    expenseDate:     expenseDate ? new Date(expenseDate) : new Date(),
    groupId:         groupId || null,
    members:         processedMembers,
    totalAmount:     parseFloat(amount),
    recoveredAmount: 0,
    notes, localId,
    syncedAt: new Date(),
  });

  if (processedMembers.length > 0) {
    const owner = await User.findById(userId).select('username displayName').lean();
    await Promise.allSettled(
      processedMembers.map(m =>
        createNotification({
          recipientId: m.userId,
          senderId:    userId,
          type:        'expense_added',
          title:       'Added to Expense',
          body:        `${owner?.displayName || owner?.username} added you to "${description}" (${currency || 'USD'} ${amount})`,
          data:        { expenseId: expense._id },
        })
      )
    );
  }

  const allUserIds = [userId, ...processedMembers.map(m => m.userId.toString())];
  await Promise.allSettled(allUserIds.map(id => invalidateUserCaches(id)));
  logger.info(`Expense created: ${expense._id} by user ${userId}`);

  const populated = await Expense.findById(expense._id)
    .populate('members.userId', 'username displayName avatar avatarColor')
    .populate('groupId', 'name avatarColor');

  res.status(201).json({ success: true, message: 'Expense created successfully', data: { expense: populated } });
});

// ─── Update expense ───────────────────────────────────────────────────────────
exports.updateExpense = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  const expense = await Expense.findOne({ _id: id, ownerId: userId, isDeleted: false });
  if (!expense) throw new AppError('Expense not found or you are not the owner', 404);

  const allowedFields = ['description', 'amount', 'category', 'customCategory', 'expenseDate', 'notes', 'type', 'members', 'currency'];
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) expense[field] = req.body[field];
  });
  if (req.body.amount !== undefined) expense.totalAmount = parseFloat(req.body.amount);

  await expense.save();

  const allUserIds = [userId, ...expense.members.map(m => m.userId.toString())];
  await Promise.allSettled(allUserIds.map(id => invalidateUserCaches(id)));

  const populated = await Expense.findById(expense._id)
    .populate('members.userId', 'username displayName avatar avatarColor')
    .populate('groupId', 'name avatarColor');

  res.status(200).json({ success: true, data: { expense: populated } });
});

// ─── Delete expense ───────────────────────────────────────────────────────────
exports.deleteExpense = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  const expense = await Expense.findOneAndUpdate(
    { _id: id, ownerId: userId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  if (!expense) throw new AppError('Expense not found', 404);

  const allUserIds = [userId, ...expense.members.map(m => m.userId.toString())];
  await Promise.allSettled(allUserIds.map(id => invalidateUserCaches(id)));

  res.status(200).json({ success: true, message: 'Expense deleted' });
});

// ─── Notify members ───────────────────────────────────────────────────────────
exports.notifyMembers = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  const expense = await Expense.findOne({ _id: id, ownerId: userId, isDeleted: false })
    .populate('members.userId', 'username displayName pushSubscriptions');

  if (!expense) throw new AppError('Expense not found', 404);

  const pendingMembers = expense.members.filter(m => m.status !== 'paid');
  if (pendingMembers.length === 0) {
    return res.status(200).json({ success: true, message: 'All members have paid' });
  }

  await sendBulkPaymentRequest(expense, pendingMembers, req.user);

  expense.members = expense.members.map(m => {
    const obj = m.toObject ? m.toObject() : { ...m };
    return {
      ...obj,
      status:      obj.status === 'added' ? 'notified' : obj.status,
      notifiedAt:  obj.status === 'added' ? new Date() : obj.notifiedAt,
    };
  });

  await expense.save();
  await invalidateUserCaches(userId);

  res.status(200).json({ success: true, message: `Notified ${pendingMembers.length} member(s)` });
});

// ─── Mark member as paid ──────────────────────────────────────────────────────
exports.markMemberPaid = catchAsync(async (req, res) => {
  const { id, memberId } = req.params;
  const userId            = req.user.id;

  const expense = await Expense.findOne({ _id: id, isDeleted: false });
  if (!expense) throw new AppError('Expense not found', 404);

  const isOwner = expense.ownerId.toString() === userId;
  const member  = expense.members.id(memberId);
  if (!member) throw new AppError('Member not found in expense', 404);

  const isSelf = member.userId.toString() === userId;
  if (!isOwner && !isSelf) throw new AppError('Only the expense owner or the member themselves can mark as paid', 403);
  if (member.status === 'paid') throw new AppError('Member already marked as paid', 400);

  const wasAmount = member.amount;
  member.status   = 'paid';
  member.paidAt   = new Date();
  expense.recoveredAmount = Math.min(expense.totalAmount, expense.recoveredAmount + wasAmount);

  await expense.save();

  if (isSelf && !isOwner) {
    await createNotification({
      recipientId: expense.ownerId, senderId: userId,
      type: 'payment_received', title: 'Payment Received',
      body: `${req.user.displayName || req.user.username} marked ${expense.currency} ${wasAmount} for "${expense.description}" as paid.`,
      data: { expenseId: expense._id },
    });
  } else if (isOwner && !isSelf) {
    await createNotification({
      recipientId: member.userId, senderId: userId,
      type: 'payment_received', title: 'Payment Confirmed',
      body: `Your payment of ${expense.currency} ${wasAmount} for "${expense.description}" has been confirmed.`,
      data: { expenseId: expense._id },
    });
  }

  const allUserIds = [expense.ownerId.toString(), member.userId.toString()];
  await Promise.allSettled(allUserIds.map(id => invalidateUserCaches(id)));

  const populated = await Expense.findById(expense._id)
    .populate('members.userId', 'username displayName avatar avatarColor');

  res.status(200).json({ success: true, data: { expense: populated } });
});

// ─── Balance summary ──────────────────────────────────────────────────────────
exports.getBalanceSummary = catchAsync(async (req, res) => {
  const userId   = req.user.id;
  const cacheKey = cacheKeys.balance(userId);
  const summary  = await cacheOrFetch(cacheKey, () => Expense.getBalanceSummary(userId), 120);
  res.status(200).json({ success: true, data: summary });
});

// ─── Monthly total ────────────────────────────────────────────────────────────
exports.getMonthlyTotal = catchAsync(async (req, res) => {
  const userId   = req.user.id;
  const { year, month } = req.query;
  const y        = parseInt(year)  || new Date().getFullYear();
  const m        = parseInt(month) || new Date().getMonth() + 1;
  const cacheKey = cacheKeys.monthlyTotal(userId, y, m);
  const total    = await cacheOrFetch(cacheKey, () => Expense.getMonthlyTotal(userId, y, m), 120);
  res.status(200).json({ success: true, data: total });
});

// ─── Change expense type ──────────────────────────────────────────────────────
exports.changeType = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  const expense = await Expense.findOne({ _id: id, ownerId: userId, isDeleted: false });
  if (!expense) throw new AppError('Expense not found', 404);

  const typeOrder = ['individual', 'equal_group', 'custom_group'];
  expense.type = typeOrder[(typeOrder.indexOf(expense.type) + 1) % typeOrder.length];

  if (expense.type === 'individual') {
    expense.members         = [];
    expense.recoveredAmount = 0;
  }

  await expense.save();
  await invalidateUserCaches(userId);

  res.status(200).json({ success: true, data: { expense } });
});
