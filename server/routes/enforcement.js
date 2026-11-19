// Proposal objective: verify date-bound permits, log entry/exit, and report field violations.
const express = require('express');
const { body } = require('express-validator');
const Booking = require('../models/Booking');
const CheckIn = require('../models/CheckIn');
const Violation = require('../models/Violation');
const authenticate = require('../middleware/auth');
const roles = require('../middleware/roles');
const validate = require('../middleware/validate');
const { getPermitDetails, verifyPermit } = require('../utils/qrGenerator');
const { philippinesDate } = require('../utils/dates');
const { recordAudit } = require('../utils/auditLogger');

const router = express.Router();
router.use(authenticate, roles('admin', 'staff', 'enforcement'));

async function findValidBooking(code) {
  const permit = getPermitDetails(code);
  if (!permit || !permit.bookingId || !verifyPermit(code, permit.bookingId)) {
    return { error: 'QR permit is not valid.' };
  }
  const booking = await Booking.findOne({ bookingId: permit.bookingId }).select('-qrImage');
  if (!booking || booking.paymentStatus !== 'paid' || booking.visitStatus === 'cancelled' ||
      !['confirmed', 'used'].includes(booking.status)) {
    return { error: 'No active, paid booking matches this permit.' };
  }
  if (booking.visitDate !== philippinesDate()) {
    return { error: 'This permit is valid only on its scheduled visit date.' };
  }
  return { booking };
}

router.post('/verify', [
  body('code').isString().trim().notEmpty().withMessage('Enter or scan a QR permit.'),
  validate
], async (req, res, next) => {
  try {
    const result = await findValidBooking(req.body.code);
    if (result.error) return res.status(400).json({ valid: false, message: result.error });
    const checkIn = await CheckIn.findOne({ bookingId: result.booking.bookingId });
    return res.json({
      valid: true,
      booking: {
        bookingId: result.booking.bookingId,
        visitorName: result.booking.visitorName,
        diverNames: [result.booking.visitorName, ...(result.booking.additionalDiverNames || [])],
        licenseMode: result.booking.licenseMode || 'individual',
        diverRoster: [
          { name: result.booking.visitorName, licenseNumber: result.booking.leadDiverLicenseNumber || '' },
          ...(result.booking.additionalDiverNames || []).map((name, index) => ({
            name,
            licenseNumber: (result.booking.additionalDiverLicenses || [])[index] || ''
          }))
        ],
        visitDate: result.booking.visitDate,
        timeSlot: result.booking.timeSlot,
        numDivers: result.booking.numDivers,
        totalAmount: result.booking.totalAmount,
        paymentMethod: result.booking.paymentMethod,
        paymentRef: result.booking.paymentRef,
        paymentStatus: result.booking.paymentStatus,
        status: result.booking.status,
        checkInTime: checkIn && checkIn.checkInTime,
        checkOutTime: checkIn && checkIn.checkOutTime
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/checkin', [
  body('code').isString().trim().notEmpty().withMessage('Enter or scan a QR permit.'),
  validate
], async (req, res, next) => {
  try {
    const result = await findValidBooking(req.body.code);
    if (result.error) return res.status(400).json({ message: result.error });
    const checkIn = await CheckIn.create({
      bookingId: result.booking.bookingId,
      verifiedBy: req.user.id,
      checkInTime: new Date()
    });
    await Booking.updateOne({ _id: result.booking._id, status: 'confirmed' }, { $set: { status: 'used' } });
    await recordAudit(req, 'visitor.checked_in', 'booking', result.booking.bookingId, {
      visitDate: result.booking.visitDate,
      divers: result.booking.numDivers
    });
    return res.json({ message: 'Visitor checked in.', checkInTime: checkIn.checkInTime });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This visitor has already been checked in.' });
    return next(error);
  }
});

router.post('/checkout', [
  body('code').isString().trim().notEmpty().withMessage('Enter or scan a QR permit.'),
  validate
], async (req, res, next) => {
  try {
    const result = await findValidBooking(req.body.code);
    if (result.error) return res.status(400).json({ message: result.error });
    const checkIn = await CheckIn.findOneAndUpdate({
      bookingId: result.booking.bookingId,
      checkInTime: { $exists: true },
      checkOutTime: { $exists: false }
    }, { $set: { checkOutTime: new Date() } }, { new: true });
    if (!checkIn) return res.status(409).json({ message: 'Visitor must be checked in before check-out.' });
    await recordAudit(req, 'visitor.checked_out', 'booking', result.booking.bookingId, {
      visitDate: result.booking.visitDate
    });
    return res.json({ message: 'Visitor checked out.', checkOutTime: checkIn.checkOutTime });
  } catch (error) {
    return next(error);
  }
});

router.post('/violations', [
  body('bookingId').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
  body('type').isIn([
    'overcrowding',
    'no_permit',
    'illegal_fishing',
    'coral_destruction',
    'marine_life_collection',
    'shark_disturbance',
    'unauthorized_underwater_activity',
    'prohibited_dive_training',
    'after_hours_diving',
    'littering_pollution',
    'improper_anchoring',
    'safety_protocol_violation',
    'littering',
    'wildlife_disturbance',
    'other'
  ]).withMessage('Choose a valid violation type.'),
  body('description').trim().isLength({ min: 5, max: 1000 }).withMessage('Description must be 5–1000 characters.'),
  validate
], async (req, res, next) => {
  try {
    const violation = await Violation.create({
      bookingId: req.body.bookingId || undefined,
      type: req.body.type,
      description: req.body.description,
      reportedBy: req.user.id
    });
    await recordAudit(req, 'violation.reported', 'violation', violation.id, {
      type: violation.type,
      bookingId: violation.bookingId || null
    });
    return res.status(201).json({ message: 'Violation report submitted.', violation });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
