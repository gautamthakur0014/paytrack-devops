'use strict';

const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string().email().required().label('Email'),
  username: Joi.string().alphanum().min(3).max(30).required().label('Username'),
  password: Joi.string().min(8).max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({ 'string.pattern.base': 'Password must contain uppercase, lowercase and a number' })
    .label('Password'),
  displayName: Joi.string().max(60).optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const forgotSchema = Joi.object({
  email: Joi.string().email().required(),
});

const verifyOtpSchema = Joi.object({
  userId: Joi.string().required(),
  otp: Joi.string().length(6).required(),
});

const resetSchema = Joi.object({
  userId: Joi.string().required(),
  resetToken: Joi.string().uuid().required(),
  newPassword: Joi.string().min(8).max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required(),
});

module.exports = { registerSchema, loginSchema, forgotSchema, verifyOtpSchema, resetSchema };
