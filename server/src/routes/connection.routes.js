'use strict';

const express = require('express');
const router = express.Router();
const connCtrl = require('../controllers/connection.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', connCtrl.listConnections);
router.post('/request', connCtrl.sendRequest);
router.get('/sent', connCtrl.sentRequests);
router.get('/received', connCtrl.receivedRequests);

router.post('/:id/accept', connCtrl.acceptRequest);
router.post('/:id/reject', connCtrl.rejectRequest);
router.delete('/:id', connCtrl.removeConnection);

router.get('/profile/:connectionUserId', connCtrl.getConnectionProfile);

module.exports = router;
