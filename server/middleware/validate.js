// Proposal objective: return explicit validation errors for untrusted request input.
const { validationResult } = require('express-validator');

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Please correct the highlighted information.',
      errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg }))
    });
  }
  return next();
};
