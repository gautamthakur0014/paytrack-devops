'use strict';

const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'removed'],
    default: 'pending',
    index: true,
  },
  acceptedAt: Date,
  rejectedAt: Date,
  removedAt: Date,
  // Message with request
  message: {
    type: String,
    maxlength: 200,
    trim: true,
  },
}, {
  timestamps: true,
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
connectionSchema.index({ requester: 1, recipient: 1 }, { unique: true });
connectionSchema.index({ requester: 1, status: 1 });
connectionSchema.index({ recipient: 1, status: 1 });

// ─── Statics ──────────────────────────────────────────────────────────────────
connectionSchema.statics.areConnected = async function (userA, userB) {
  const conn = await this.findOne({
    $or: [
      { requester: userA, recipient: userB, status: 'accepted' },
      { requester: userB, recipient: userA, status: 'accepted' },
    ],
  }).lean();
  return Boolean(conn);
};

connectionSchema.statics.getConnectionIds = async function (userId) {
  const connections = await this.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' },
    ],
  }).lean();

  return connections.map(c =>
    c.requester.toString() === userId.toString() ? c.recipient : c.requester
  );
};

const Connection = mongoose.model('Connection', connectionSchema);

module.exports = Connection;
