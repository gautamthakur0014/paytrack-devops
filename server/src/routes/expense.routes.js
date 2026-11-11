'use strict';

const express = require('express');
const router = express.Router();
const expenseCtrl = require('../controllers/expense.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.route('/')
  .get(expenseCtrl.listExpenses)
  .post(expenseCtrl.createExpense);

// These specific routes must come BEFORE /:id to avoid conflicts
router.get('/balance', expenseCtrl.getBalanceSummary);
router.get('/monthly-total', expenseCtrl.getMonthlyTotal);

router.route('/:id')
  .patch(expenseCtrl.updateExpense)   // Frontend uses PATCH, not PUT
  .put(expenseCtrl.updateExpense)     // Keep PUT as alias for compatibility
  .delete(expenseCtrl.deleteExpense);

router.patch('/:id/type', expenseCtrl.changeType);
router.post('/:id/notify', expenseCtrl.notifyMembers);
router.patch('/:id/members/:memberId/paid', expenseCtrl.markMemberPaid);

module.exports = router;
