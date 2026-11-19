// Proposal objective: authenticate LGU personnel and issue role-bearing JWTs.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const { recordAudit } = require('../utils/auditLogger');

const router = express.Router();
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

router.post('/login', [
  body('email').isEmail().trim().toLowerCase().withMessage('Enter a valid email address.'),
  body('password').isString().notEmpty().withMessage('Password is required.'),
  validate
], async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email }).select('+password');
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '8h', audience: 'staff' });
    res.cookie('tidesToken', token, cookieOptions);
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('tidesToken', cookieOptions);
  return res.json({ message: 'Signed out.' });
});

router.get('/me', authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      mustChangePassword: req.user.mustChangePassword
    }
  });
});

router.post('/change-password', authenticate, [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required.'),
  body('newPassword').isString().isLength({ min: 10, max: 100 }).withMessage('New password must be at least 10 characters.'),
  validate
], async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.password))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }
    if (await bcrypt.compare(req.body.newPassword, user.password)) {
      return res.status(400).json({ message: 'Choose a new password different from your current password.' });
    }
    user.password = await bcrypt.hash(req.body.newPassword, 12);
    user.mustChangePassword = false;
    await user.save();
    await recordAudit(req, 'account.password_changed', 'user', user.id);
    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
