'use strict';

const express = require('express');
const router = express.Router();
const Group = require('../models/Group.model');
const User = require('../models/User.model');
const Connection = require('../models/Connection.model');
const { protect } = require('../middleware/auth.middleware');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

router.use(protect);

// List groups for current user
router.get('/', catchAsync(async (req, res) => {
  const groups = await Group.find({ 'members.userId': req.user.id, isActive: true })
    .populate('members.userId', 'username displayName avatar avatarColor')
    .lean();
  res.json({ success: true, data: { groups } });
}));

// Create group
router.post('/', catchAsync(async (req, res) => {
  const { name, description, category, memberIds, avatarColor } = req.body;

  // De-duplicate memberIds
  const uniqueMemberIds = [...new Set((memberIds || []).map(id => id.toString()))];

  if (uniqueMemberIds.length) {
    const checks = await Promise.all(uniqueMemberIds.map(id => Connection.areConnected(req.user.id, id)));
    if (checks.some(c => !c)) throw new AppError('All group members must be connections', 400);
  }

  const group = await Group.create({
    name,
    description,
    category: category || 'other',
    avatarColor: avatarColor || '#14b8a6',
    createdBy: req.user.id,
    members: [
      { userId: req.user.id, role: 'admin' },
      ...uniqueMemberIds.map(id => ({ userId: id, role: 'member' })),
    ],
  });

  const populated = await Group.findById(group._id)
    .populate('members.userId', 'username displayName avatar avatarColor');

  res.status(201).json({ success: true, data: { group: populated } });
}));

// Get single group
router.get('/:id', catchAsync(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.id, 'members.userId': req.user.id, isActive: true })
    .populate('members.userId', 'username displayName avatar avatarColor');
  if (!group) throw new AppError('Group not found', 404);
  res.json({ success: true, data: { group } });
}));

// Update group (admin only)
router.patch('/:id', catchAsync(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.id, isActive: true });
  if (!group) throw new AppError('Group not found', 404);

  const member = group.members.find(m => m.userId.toString() === req.user.id);
  if (!member || member.role !== 'admin') throw new AppError('Only admins can update the group', 403);

  const allowed = ['name', 'description', 'category', 'avatarColor'];
  allowed.forEach(k => { if (req.body[k] !== undefined) group[k] = req.body[k]; });
  await group.save();

  const populated = await Group.findById(group._id)
    .populate('members.userId', 'username displayName avatar avatarColor');

  res.json({ success: true, data: { group: populated } });
}));

// Delete/deactivate group
router.delete('/:id', catchAsync(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.id, isActive: true });
  if (!group) throw new AppError('Group not found', 404);

  const member = group.members.find(m => m.userId.toString() === req.user.id);
  if (!member || member.role !== 'admin') throw new AppError('Only admins can delete the group', 403);

  group.isActive = false;
  await group.save();
  res.json({ success: true, message: 'Group deleted' });
}));

// Get connected users eligible to be added to a group (not already members)
router.get('/:id/eligible-members', catchAsync(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.id, isActive: true });
  if (!group) throw new AppError('Group not found', 404);

  const isMember = group.members.some(m => m.userId.toString() === req.user.id);
  if (!isMember) throw new AppError('Not a member of this group', 403);

  // Get all connection IDs
  const connectionIds = await Connection.getConnectionIds(req.user.id);

  // Filter out existing group members
  const existingMemberIds = group.members.map(m => m.userId.toString());
  const eligibleIds = connectionIds.filter(id => !existingMemberIds.includes(id.toString()));

  const users = await User.find({ _id: { $in: eligibleIds }, isActive: true })
    .select('username displayName avatar avatarColor')
    .lean();

  res.json({ success: true, data: { users } });
}));

// Add member to group (no duplicates)
router.post('/:id/members', catchAsync(async (req, res) => {
  const { username, userId: memberUserId } = req.body;

  const group = await Group.findOne({ _id: req.params.id, isActive: true });
  if (!group) throw new AppError('Group not found', 404);

  const requester = group.members.find(m => m.userId.toString() === req.user.id);
  if (!requester || requester.role !== 'admin') throw new AppError('Only admins can add members', 403);

  // Find target user
  let targetUser;
  if (username) {
    targetUser = await User.findOne({ username: username.toLowerCase(), isActive: true });
  } else if (memberUserId) {
    targetUser = await User.findById(memberUserId);
  }
  if (!targetUser) throw new AppError('User not found', 404);

  // Must be connected
  const connected = await Connection.areConnected(req.user.id, targetUser._id.toString());
  if (!connected) throw new AppError('You must be connected with this user to add them', 400);

  // Check not already a member (prevent duplicates)
  const alreadyMember = group.members.some(m => m.userId.toString() === targetUser._id.toString());
  if (alreadyMember) throw new AppError('User is already a member of this group', 409);

  group.members.push({ userId: targetUser._id, role: 'member' });
  await group.save();

  const populated = await Group.findById(group._id)
    .populate('members.userId', 'username displayName avatar avatarColor');

  res.status(201).json({ success: true, data: { group: populated } });
}));

// Remove member from group
router.delete('/:id/members/:userId', catchAsync(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.id, isActive: true });
  if (!group) throw new AppError('Group not found', 404);

  const requester = group.members.find(m => m.userId.toString() === req.user.id);
  if (!requester || requester.role !== 'admin') throw new AppError('Only admins can remove members', 403);

  if (group.createdBy.toString() === req.params.userId) {
    throw new AppError('Cannot remove the group creator', 400);
  }

  const beforeLength = group.members.length;
  group.members = group.members.filter(m => m.userId.toString() !== req.params.userId);
  if (group.members.length === beforeLength) throw new AppError('Member not found in group', 404);

  await group.save();
  res.json({ success: true, message: 'Member removed' });
}));

// Leave group
router.post('/:id/leave', catchAsync(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.id, isActive: true });
  if (!group) throw new AppError('Group not found', 404);

  if (group.createdBy.toString() === req.user.id) {
    throw new AppError('Group creator cannot leave. Delete the group or transfer ownership.', 400);
  }

  const isMember = group.members.some(m => m.userId.toString() === req.user.id);
  if (!isMember) throw new AppError('You are not a member of this group', 400);

  group.members = group.members.filter(m => m.userId.toString() !== req.user.id);
  await group.save();

  res.json({ success: true, message: 'Left group successfully' });
}));

module.exports = router;
