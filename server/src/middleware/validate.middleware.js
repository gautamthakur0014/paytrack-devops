'use strict';

const AppError = require('../utils/AppError');

function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(d => d.message).join('. ');
      return next(new AppError(messages, 400));
    }

    req.body = value;
    next();
  };
}

module.exports = { validateBody };
