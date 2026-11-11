'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');
const { registerSchema, loginSchema, forgotSchema, verifyOtpSchema, resetSchema } = require('../validators/auth.validator');

router.post('/register', validateBody(registerSchema), auth.register);
router.post('/login', validateBody(loginSchema), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.post('/forgot-password', validateBody(forgotSchema), auth.forgotPassword);
router.post('/verify-otp', validateBody(verifyOtpSchema), auth.verifyOtp);
router.post('/reset-password', validateBody(resetSchema), auth.resetPassword);
router.get('/me', protect, auth.me);

module.exports = router;
