// Proposal objective: register visitors, manage their sessions, and expose only their own bookings.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const VisitorAccount = require('../models/VisitorAccount');
const Booking = require('../models/Booking');
const authenticateVisitor = require('../middleware/authenticateVisitor');
const { createPermit } = require('../utils/qrGenerator');
const publicBaseUrl = require('../utils/publicBaseUrl');

const router = express.Router();
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

function publicVisitor(visitor) {
  return { id: visitor.id, name: visitor.name, email: visitor.email };
}

function validationMessage(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  return next();
}

function issueVisitorSession(visitor, res) {
  const token = jwt.sign({ sub: visitor.id }, process.env.JWT_SECRET, { expiresIn: '8h', audience: 'visitor' });
  res.cookie('tidesVisitorToken', token, cookieOptions);
  return { visitor: publicVisitor(visitor) };
}

async function ensureUploadedReceipt(booking, req) {
  if (!booking.paymentProofPath || !['pending_verification', 'rejected'].includes(booking.paymentStatus)) {
    return booking;
  }
  const changes = {};
  if (!booking.paymentProofName) changes.paymentProofName = 'Uploaded receipt image';
  const baseUrl = publicBaseUrl(req);
  const receiptUrlIsCurrent = booking.qrCode &&
    new URL(booking.qrCode).origin === new URL(baseUrl).origin;
  if (!receiptUrlIsCurrent || !booking.qrImage) {
    const permit = await createPermit(booking.bookingId, baseUrl);
    changes.qrCode = permit.value;
    changes.qrImage = permit.image;
  }
  if (Object.keys(changes).length) {
    const updated = await Booking.findOneAndUpdate({
      _id: booking._id,
      paymentStatus: booking.paymentStatus,
      paymentProofPath: booking.paymentProofPath
    }, { $set: changes }, { new: true, runValidators: true }).select('-paymentProofMimeType');
    booking = updated || await Booking.findOne({ _id: booking._id }).select('-paymentProofMimeType');
  }
  return booking;
}

router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
  body('password').isString().isLength({ min: 10, max: 100 }).withMessage('Password must be 10–100 characters.'),
  validationMessage
], async (req, res, next) => {
  try {
    const password = await bcrypt.hash(req.body.password, 12);
    const visitor = await VisitorAccount.create({
      name: req.body.name,
      email: req.body.email,
      password
    });
    return res.status(201).json(issueVisitorSession(visitor, res));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with that email already exists.' });
    return next(error);
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
  body('password').isString().notEmpty().withMessage('Password is required.'),
  validationMessage
], async (req, res, next) => {
  try {
    const visitor = await VisitorAccount.findOne({ email: req.body.email }).select('+password');
    if (!visitor || !(await bcrypt.compare(req.body.password, visitor.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    return res.json(issueVisitorSession(visitor, res));
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('tidesVisitorToken', cookieOptions);
  return res.json({ message: 'Signed out.' });
});

router.get('/me', authenticateVisitor, (req, res) => {
  return res.json({ visitor: publicVisitor(req.visitor) });
});

router.get('/bookings', authenticateVisitor, async (req, res, next) => {
  try {
    const bookings = await Booking.find({ visitorId: req.visitor.id })
      .sort({ createdAt: -1 })
      .select('-qrImage -paymentProofPath -paymentProofMimeType');
    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
});

router.get('/bookings/:bookingId', authenticateVisitor, async (req, res, next) => {
  try {
    let booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      visitorId: req.visitor.id
    }).select('-paymentProofMimeType');
    if (!booking) return res.status(404).json({ message: 'Booking was not found.' });
    booking = await ensureUploadedReceipt(booking, req);
    const publicBooking = booking.toObject();
    delete publicBooking.paymentProofPath;
    delete publicBooking.paymentProofMimeType;
    return res.json({ booking: publicBooking });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
