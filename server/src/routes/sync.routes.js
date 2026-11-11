'use strict';

const express = require('express');
const router  = express.Router();
const Expense = require('../models/Expense.model');
const Connection = require('../models/Connection.model');
const User    = require('../models/User.model');
const { protect }           = require('../middleware/auth.middleware');
const { invalidatePattern } = require('../config/redis');
const { createNotification } = require('../services/notification.service');
const catchAsync = require('../utils/catchAsync');
const logger  = require('../config/logger');

/**
 * POST /api/v1/sync/push
 *
 * Applies a batch of offline operations queued by the client.
 * Member connection checks skip the expense owner (you can't be "connected"
 * to yourself and the frontend already excludes you from the members array).
 */
router.post('/push', protect, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { operations } = req.body;

  if (!Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({ success: false, message: 'No operations provided' });
  }

  const results = [];
  const errors  = [];

  for (const operation of operations) {
    try {
      const { op, data } = operation;

      // ── CREATE ──────────────────────────────────────────────────────────────
      if (op === 'create') {

        // Idempotency guard
        if (data.localId) {
          const existing = await Expense.findOne({ localId: data.localId, ownerId: userId });
          if (existing) {
            results.push({ localId: data.localId, serverId: existing._id, op: 'skipped' });
            continue;
          }
        }

        const amount = parseFloat(data.amount);
        if (!amount || amount <= 0) {
          errors.push({ localId: data.localId, error: 'Invalid or missing amount' });
          continue;
        }

        const type = data.type || 'individual';
        let processedMembers = [];

        if (data.members?.length > 0 && type !== 'individual') {
          // ── Filter out the expense owner from the members array ─────────────
          // The frontend already does this, but be defensive here too.
          const memberIds = data.members
            .map(m => m.userId)
            .filter(id => id && id.toString() !== userId.toString());

          // Check connections — only for OTHER users, never the owner
          const connectionChecks = await Promise.all(
            memberIds.map(id => Connection.areConnected(userId, id).catch(() => false))
          );
          const invalidMembers = memberIds.filter((_, i) => !connectionChecks[i]);

          if (invalidMembers.length > 0) {
            errors.push({
              localId: data.localId,
              error: `Not connected to ${invalidMembers.length} member(s)`,
            });
            continue;
          }

          const memberUsers = await User.find({ _id: { $in: memberIds } })
            .select('username displayName avatar avatarColor')
            .lean();
          const memberMap = Object.fromEntries(memberUsers.map(u => [u._id.toString(), u]));

          processedMembers = memberIds.map(mid => {
            const m = data.members.find(x => x.userId === mid || x.userId?.toString() === mid);
            const memberUser = memberMap[mid] || {};
            let memberAmount = parseFloat(m?.amount) || 0;
            if (type === 'equal_group') {
              memberAmount = parseFloat((amount / (memberIds.length + 1)).toFixed(2));
            }
            return {
              userId:      mid,
              username:    memberUser.username,
              displayName: memberUser.displayName || memberUser.username,
              avatar:      memberUser.avatar,
              avatarColor: memberUser.avatarColor,
              amount:      memberAmount,
              status:      'added',
              splitType:   type === 'equal_group' ? 'equal' : 'custom',
            };
          });
        }

        const { _id, _isOffline, ownerId: _ownerId, ...cleanData } = data;

        const expense = await Expense.create({
          ...cleanData,
          ownerId:         userId,
          type,
          amount,
          totalAmount:     amount,
          recoveredAmount: 0,
          currency:        data.currency   || 'USD',
          category:        data.category   || 'other',
          expenseDate:     data.expenseDate ? new Date(data.expenseDate) : new Date(),
          groupId:         data.groupId    || null,
          members:         processedMembers,
          notes:           data.notes      || '',
          localId:         data.localId,
          syncedAt:        new Date(),
        });

        // Notify added members (fire-and-forget)
        if (processedMembers.length > 0) {
          const owner = await User.findById(userId).select('username displayName').lean();
          Promise.allSettled(
            processedMembers.map(m => createNotification({
              recipientId: m.userId,
              senderId:    userId,
              type:        'expense_added',
              title:       'Added to Expense',
              body:        `${owner?.displayName || owner?.username} added you to "${expense.description}" (${expense.currency} ${expense.amount})`,
              data:        { expenseId: expense._id },
            }))
          );
        }

        results.push({ localId: data.localId, serverId: expense._id, op: 'created' });

      // ── UPDATE ──────────────────────────────────────────────────────────────
      } else if (op === 'update') {
        const { _id: expId, _isOffline, localId, ...updateData } = data;

        if (!expId || expId.startsWith('offline_')) {
          errors.push({ localId: data.localId, error: 'Cannot update: no valid server _id' });
          continue;
        }

        const allowedFields = ['description', 'amount', 'category', 'customCategory', 'expenseDate', 'notes', 'type', 'members', 'currency'];
        const safeUpdate = {};
        allowedFields.forEach(f => { if (updateData[f] !== undefined) safeUpdate[f] = updateData[f]; });
        if (safeUpdate.amount !== undefined) safeUpdate.totalAmount = parseFloat(safeUpdate.amount);

        const updated = await Expense.findOneAndUpdate(
          { _id: expId, ownerId: userId },
          { ...safeUpdate, syncedAt: new Date() },
          { new: true }
        );
        results.push({ localId, serverId: expId, op: updated ? 'updated' : 'not_found' });

      // ── DELETE ──────────────────────────────────────────────────────────────
      } else if (op === 'delete') {
        const { _id: expId } = data;

        if (!expId || expId.startsWith('offline_')) {
          results.push({ localId: data.localId, serverId: null, op: 'skipped_local_only' });
          continue;
        }

        await Expense.findOneAndUpdate(
          { _id: expId, ownerId: userId },
          { isDeleted: true, deletedAt: new Date() }
        );
        results.push({ localId: data.localId, serverId: expId, op: 'deleted' });

      } else {
        errors.push({ localId: data?.localId, error: `Unknown operation: ${op}` });
      }

    } catch (err) {
      logger.error('Sync push error:', err.message);
      errors.push({ localId: operation.data?.localId, error: err.message });
    }
  }

  await Promise.allSettled([
    invalidatePattern(`expenses:${userId}:*`),
    invalidatePattern(`balance:${userId}`),
    invalidatePattern(`monthly:${userId}:*`),
  ]);

  res.status(200).json({
    success: true,
    data: { results, errors, syncedAt: new Date() },
  });
}));

/**
 * GET /api/v1/sync/pull?since=ISO_DATE
 */
router.get('/pull', protect, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { since } = req.query;
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const expenses = await Expense.find({
    $or: [
      { ownerId: userId,           updatedAt: { $gt: sinceDate } },
      { ownerId: userId,           createdAt: { $gt: sinceDate } },
      { 'members.userId': userId,  updatedAt: { $gt: sinceDate } },
    ],
    isDeleted: false,
  })
    .populate('members.userId', 'username displayName avatar avatarColor')
    .populate('groupId', 'name avatarColor')
    .lean()
    .limit(500);

  res.status(200).json({ success: true, data: { expenses, pulledAt: new Date() } });
}));

module.exports = router;
