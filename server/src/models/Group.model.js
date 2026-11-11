'use strict';

const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member',
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  description: {
    type: String,
    maxlength: 300,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  members: {
    type: [groupMemberSchema],
    default: [],
  },
  category: {
    type: String,
    enum: ['trip', 'roommates', 'office', 'friends', 'family', 'other'],
    default: 'other',
  },
  avatarColor: {
    type: String,
    default: '#10b981',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

groupSchema.virtual('memberCount').get(function () {
  return this.members.length;
});

groupSchema.index({ createdBy: 1 });
groupSchema.index({ 'members.userId': 1 });

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
