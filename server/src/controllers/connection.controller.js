'use strict';

const Connection = require('../models/Connection.model');
const User = require('../models/User.model');
const { createNotification } = require('../services/notification.service');
const { cacheOrFetch, invalidatePattern } = require('../config/redis');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// ─── Send connection request ──────────────────────────────────────────────────
exports.sendRequest = catchAsync(async (req, res) => {
  const requesterId = req.user.id;
  const { username, message } = req.body;

  const recipient = await User.findOne({ username: username.toLowerCase() });
  if (!recipient) throw new AppError('User not found', 404);

  if (recipient._id.toString() === requesterId) {
    throw new AppError('Cannot connect with yourself', 400);
  }

  const existing = await Connection.findOne({
    $or: [
      { requester: requesterId, recipient: recipient._id },
      { requester: recipient._id, recipient: requesterId },
    ],
  });

  if (existing) {
    const msg = {
      accepted: 'Already connected',
      pending: 'Request already sent',
      rejected: 'Request was previously rejected',
      removed: 'Connection was removed',
    }[existing.status] || 'Connection already exists';
    throw new AppError(msg, 409);
  }

  const connection = await Connection.create({
    requester: requesterId,
    recipient: recipient._id,
    message,
  });

  // Notify recipient
  await createNotification({
    recipientId: recipient._id,
    senderId: requesterId,
    type: 'connection_request',
    title: 'New Connection Request',
    body: `${req.user.displayName || req.user.username} wants to connect with you.`,
    data: { connectionId: connection._id },
  });

  await invalidatePattern(`connections:${requesterId}:*`);
  await invalidatePattern(`connections:${recipient._id}:*`);

  res.status(201).json({
    success: true,
    message: 'Connection request sent',
    data: { connection },
  });
});

// ─── Accept request ───────────────────────────────────────────────────────────
exports.acceptRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const connection = await Connection.findOne({
    _id: id,
    recipient: userId,
    status: 'pending',
  }).populate('requester', 'username displayName avatar avatarColor');

  if (!connection) throw new AppError('Connection request not found', 404);

  connection.status = 'accepted';
  connection.acceptedAt = new Date();
  await connection.save();

  await createNotification({
    recipientId: connection.requester._id,
    senderId: userId,
    type: 'connection_accepted',
    title: 'Connection Accepted',
    body: `${req.user.displayName || req.user.username} accepted your connection request.`,
    data: { connectionId: connection._id },
  });

  await invalidatePattern(`connections:${userId}:*`);
  await invalidatePattern(`connections:${connection.requester._id}:*`);

  res.status(200).json({ success: true, message: 'Connection accepted', data: { connection } });
});

// ─── Reject request ───────────────────────────────────────────────────────────
exports.rejectRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const connection = await Connection.findOneAndUpdate(
    { _id: id, recipient: userId, status: 'pending' },
    { status: 'rejected', rejectedAt: new Date() },
    { new: true }
  );

  if (!connection) throw new AppError('Connection request not found', 404);

  await invalidatePattern(`connections:${userId}:*`);

  res.status(200).json({ success: true, message: 'Connection request rejected' });
});

// ─── Remove connection ────────────────────────────────────────────────────────
exports.removeConnection = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const connection = await Connection.findOneAndUpdate(
    {
      _id: id,
      status: 'accepted',
      $or: [{ requester: userId }, { recipient: userId }],
    },
    { status: 'removed', removedAt: new Date() },
    { new: true }
  );

  if (!connection) throw new AppError('Connection not found', 404);

  const otherId = connection.requester.toString() === userId
    ? connection.recipient : connection.requester;

  await invalidatePattern(`connections:${userId}:*`);
  await invalidatePattern(`connections:${otherId}:*`);

  res.status(200).json({ success: true, message: 'Connection removed' });
});

// ─── List connections ─────────────────────────────────────────────────────────
exports.listConnections = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { search, page = 1, limit = 20 } = req.query;

  const cacheKey = `connections:${userId}:list:${search || ''}:${page}`;

  const result = await cacheOrFetch(cacheKey, async () => {
    const filter = {
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted',
    };

    const connections = await Connection.find(filter)
      .populate('requester', 'username displayName avatar avatarColor lastSeen')
      .populate('recipient', 'username displayName avatar avatarColor lastSeen')
      .sort({ acceptedAt: -1 })
      .lean();

    let results = connections.map(conn => {
      const other = conn.requester._id.toString() === userId
        ? conn.recipient : conn.requester;
      return { ...other, connectionId: conn._id, connectedAt: conn.acceptedAt };
    });

    if (search) {
      const s = search.toLowerCase();
      results = results.filter(r =>
        r.username.includes(s) || (r.displayName || '').toLowerCase().includes(s)
      );
    }

    return { connections: results, total: results.length };
  }, 120);

  res.status(200).json({ success: true, data: result });
});

// ─── Sent requests ────────────────────────────────────────────────────────────
exports.sentRequests = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const requests = await Connection.find({ requester: userId, status: 'pending' })
    .populate('recipient', 'username displayName avatar avatarColor')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, data: { requests } });
});

// ─── Received requests ────────────────────────────────────────────────────────
exports.receivedRequests = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const requests = await Connection.find({ recipient: userId, status: 'pending' })
    .populate('requester', 'username displayName avatar avatarColor')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, data: { requests } });
});

// ─── Connection profile (payment history) ────────────────────────────────────
exports.getConnectionProfile = catchAsync(async (req, res) => {
  const { connectionUserId } = req.params;
  const userId = req.user.id;

  const isConnected = await Connection.areConnected(userId, connectionUserId);
  if (!isConnected) throw new AppError('Not connected with this user', 403);

  const user = await User.findById(connectionUserId).lean();
  if (!user) throw new AppError('User not found', 404);

  const Expense = require('../models/Expense.model');

  // Expenses shared between the two users
  const sharedExpenses = await Expense.find({
    isDeleted: false,
    $or: [
      { ownerId: userId, 'members.userId': connectionUserId },
      { ownerId: connectionUserId, 'members.userId': userId },
    ],
  })
    .sort({ expenseDate: -1 })
    .limit(50)
    .lean();

  res.status(200).json({
    success: true,
    data: {
      user: { ...user, password: undefined },
      sharedExpenses,
    },
  });
});
