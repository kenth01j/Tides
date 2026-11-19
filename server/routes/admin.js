// Proposal objective: provide LGU staff with operational, capacity, user, and compliance controls.
const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { body, query } = require('express-validator');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Capacity = require('../models/Capacity');
const CheckIn = require('../models/CheckIn');
const Setting = require('../models/Setting');
const User = require('../models/User');
const Violation = require('../models/Violation');
const AuditLog = require('../models/AuditLog');
const authenticate = require('../middleware/auth');
const roles = require('../middleware/roles');
const validate = require('../middleware/validate');
const { defaultLimit, releaseCapacity } = require('../utils/capacityChecker');
const { philippinesDate, isRealDateString } = require('../utils/dates');
const { recordAudit } = require('../utils/auditLogger');
const { getDoneReportRange } = require('../utils/doneReport');
const { csvDocument } = require('../utils/csv');
const { visitStatusError } = require('../utils/visitStatusRules');
const { createPermit } = require('../utils/qrGenerator');
const publicBaseUrl = require('../utils/publicBaseUrl');
const {
  validateAdditionalDiverNames,
  validateAdditionalDiverLicenses,
  validateDiverLicenseNumber
} = require('../utils/diverNames');

const router = express.Router();
const proofDirectory = path.join(__dirname, '..', 'private', 'payment-proofs');
const timeSlots = ['06:00-08:00', '08:00-10:00', '10:00-12:00', '12:00-14:00'];
router.use(authenticate, roles('admin', 'staff'));

router.get('/stats', async (req, res, next) => {
  try {
    const today = philippinesDate();
    const [todayBookings, todayPaid, todayCapacity, revenue] = await Promise.all([
      Booking.aggregate([{ $match: { visitDate: today, paymentStatus: 'paid', status: { $ne: 'cancelled' }, visitStatus: { $ne: 'cancelled' } } }, { $group: { _id: null, divers: { $sum: '$numDivers' } } }]),
      Booking.aggregate([{ $match: { visitDate: today, paymentStatus: 'paid' } }, { $group: { _id: null, amount: { $sum: '$totalAmount' } } }]),
      Capacity.findOne({ date: today }),
      Booking.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, amount: { $sum: '$totalAmount' } } }])
    ]);
    const limit = todayCapacity ? todayCapacity.maxDivers : await defaultLimit();
    return res.json({
      todayVisitors: todayBookings[0] ? todayBookings[0].divers : 0,
      todayRevenue: todayPaid[0] ? todayPaid[0].amount : 0,
      capacityLimit: limit,
      capacityUsed: todayCapacity ? todayCapacity.currentCount : 0,
      totalRevenue: revenue[0] ? revenue[0].amount : 0
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/bookings', [
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('status').optional().isIn(['pending', 'confirmed', 'used', 'cancelled']),
  query('visitStatus').optional().isIn(['ongoing', 'done', 'cancelled']),
  query('paymentStatus').optional().isIn(['pending', 'pending_verification', 'rejected', 'processing', 'paid', 'failed']),
  validate
], async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.date) filter.visitDate = req.query.date;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.visitStatus === 'cancelled') {
      filter.$or = [{ visitStatus: 'cancelled' }, { status: 'cancelled' }];
    } else if (req.query.visitStatus) {
      filter.visitStatus = req.query.visitStatus;
    }
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    const records = await Booking.find(filter).sort({ visitDate: 1, createdAt: -1 }).limit(500)
      .select('-qrImage -paymentProofPath -paymentProofMimeType');
    const bookings = records.map(record => {
      const booking = record.toObject();
      if (booking.status === 'cancelled') booking.visitStatus = 'cancelled';
      return booking;
    });
    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
});

router.post('/walk-ins', [
  body('visitorName').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid visitor email address.'),
  body('phone').trim().isLength({ min: 7, max: 24 }).withMessage('Enter a valid phone number.'),
  body('nationality').trim().isLength({ min: 2, max: 60 }).withMessage('Enter the visitor nationality.'),
  body('diverType').isIn(['recreational', 'technical']).withMessage('Choose a permitted scuba diver type.'),
  body('leadDiverLicenseNumber').custom((licenseNumber, { req }) => {
    const result = validateDiverLicenseNumber(licenseNumber);
    if (!result.valid) throw new Error(result.message);
    req.body.leadDiverLicenseNumber = result.licenseNumber;
    return true;
  }),
  body('licenseMode').isIn(['group', 'individual']).withMessage('Choose group or individual scuba licenses.'),
  body('visitDate').custom(isRealDateString).withMessage('Date must use YYYY-MM-DD format.'),
  body('timeSlot').isIn(timeSlots).withMessage('Choose a valid visit time.'),
  body('numDivers').isInt({ min: 1, max: 500 }).withMessage('Number of divers must be between 1 and 500.'),
  body('additionalDiverNames').custom((names, { req }) => {
    const result = validateAdditionalDiverNames(names, req.body.numDivers);
    if (!result.valid) throw new Error(result.message);
    req.body.additionalDiverNames = result.names;
    return true;
  }),
  body('additionalDiverLicenses').custom((licenses, { req }) => {
    const result = validateAdditionalDiverLicenses(licenses, req.body.numDivers, req.body.licenseMode);
    if (!result.valid) throw new Error(result.message);
    req.body.additionalDiverLicenses = result.licenses;
    return true;
  }),
  validate
], async (req, res, next) => {
  let reserved = false;
  let bookingCreated = false;
  let paymentCreated = false;
  let createdBookingId;
  const { visitDate, numDivers } = req.body;
  try {
    if (visitDate !== philippinesDate()) {
      return res.status(400).json({ message: 'Walk-in bookings can only be created for today.' });
    }

    const capacity = await reserveCapacity(visitDate, Number(numDivers));
    if (!capacity) {
      return res.status(409).json({ message: 'Today is full or unavailable. Update capacity before adding this walk-in.' });
    }
    reserved = true;
    const feeSetting = await Setting.findOne({ key: 'fee' });
    const totalAmount = (feeSetting ? Number(feeSetting.value) : 300) * Number(numDivers);
    const bookingId = `TDS-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    createdBookingId = bookingId;
    const permit = await createPermit(bookingId, publicBaseUrl(req));
    const paidAt = new Date();
    const booking = await Booking.create({
      bookingId,
      visitorName: req.body.visitorName,
      email: req.body.email,
      phone: req.body.phone,
      nationality: req.body.nationality,
      diverType: req.body.diverType,
      leadDiverLicenseNumber: req.body.leadDiverLicenseNumber,
      licenseMode: req.body.licenseMode,
      additionalDiverNames: req.body.additionalDiverNames,
      additionalDiverLicenses: req.body.additionalDiverLicenses,
      visitDate,
      timeSlot: req.body.timeSlot,
      numDivers: Number(numDivers),
      totalAmount,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paymentRef: `WALKIN-${bookingId}`,
      paymentVerifiedAt: paidAt,
      paymentVerifiedBy: req.user.id,
      paidAt,
      status: 'confirmed',
      qrCode: permit.value,
      qrImage: permit.image
    });
    bookingCreated = true;
    await Payment.create({
      bookingId,
      method: 'cash',
      amount: totalAmount,
      referenceNo: `WALKIN-${bookingId}`,
      status: 'success',
      verifiedAt: paidAt,
      verifiedBy: req.user.id
    });
    paymentCreated = true;
    await recordAudit(req, 'booking.walk_in_created', 'booking', bookingId, {
      paymentMethod: 'cash',
      numDivers: Number(numDivers),
      totalAmount
    });

    return res.status(201).json({
      message: 'Walk-in booking created and recorded as paid on-site.',
      booking: {
        bookingId,
        visitorName: booking.visitorName,
        email: booking.email,
        visitDate: booking.visitDate,
        timeSlot: booking.timeSlot,
        numDivers: booking.numDivers,
        totalAmount: booking.totalAmount,
        paymentMethod: booking.paymentMethod,
        paymentStatus: booking.paymentStatus,
        paymentRef: booking.paymentRef,
        status: booking.status,
        qrCode: booking.qrCode
      }
    });
  } catch (error) {
    let cleanupError;
    try {
      if (paymentCreated) await Payment.deleteOne({ referenceNo: `WALKIN-${createdBookingId}` });
    } catch (failure) { cleanupError = failure; }
    try {
      if (bookingCreated) await Booking.deleteOne({ bookingId: createdBookingId });
    } catch (failure) { cleanupError = cleanupError || failure; }
    try {
      if (reserved) await releaseCapacity(visitDate, Number(numDivers));
    } catch (failure) { cleanupError = cleanupError || failure; }
    if (cleanupError) return next(cleanupError);
    return next(error);
  }
});

router.get('/done-bookings', async (req, res, next) => {
  try {
    const bookings = await Booking.find({ visitStatus: 'done' })
      .select('bookingId visitorName email visitDate timeSlot numDivers totalAmount paymentMethod paymentStatus paidAt')
      .sort({ visitDate: -1, createdAt: -1 })
      .lean();
    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
});

router.get('/cancelled-bookings', async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      $or: [{ visitStatus: 'cancelled' }, { status: 'cancelled' }]
    })
      .select('bookingId visitorName email visitDate timeSlot numDivers totalAmount paymentMethod paymentStatus paidAt')
      .sort({ visitDate: -1, createdAt: -1 })
      .lean();
    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
});

router.get('/audit-logs', roles('admin'), async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(300)
      .select('actorName actorRole action targetType targetId details createdAt')
      .lean();
    return res.json({ logs });
  } catch (error) {
    return next(error);
  }
});

router.get('/done-bookings/export.csv', roles('admin'), [
  query('period').isIn(['daily', 'monthly', 'yearly', '1-year', '2-year', '3-year'])
    .withMessage('Choose daily, monthly, yearly, 1-year, 2-year, or 3-year.'),
  validate
], async (req, res, next) => {
  try {
    const period = req.query.period;
    let range;
    try {
      range = getDoneReportRange(period, req.query, philippinesDate());
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    const { from, through } = range;

    const bookings = await Booking.find({
      visitStatus: 'done',
      visitDate: { $gte: from, $lte: through }
    })
      .select('bookingId visitorName email phone nationality diverType visitDate timeSlot numDivers totalAmount paymentMethod paymentStatus')
      .sort({ visitDate: 1, createdAt: 1 })
      .lean();
    const rows = [
      ['Booking ID', 'Visitor', 'Email', 'Phone', 'Nationality', 'Diver type', 'Visit date', 'Time slot', 'Divers', 'Amount PHP', 'Payment method', 'Payment status'],
      ...bookings.map(item => [
        item.bookingId, item.visitorName, item.email, item.phone, item.nationality, item.diverType,
        item.visitDate, item.timeSlot, item.numDivers, item.totalAmount, item.paymentMethod, item.paymentStatus
      ])
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tides-done-${period}-${from}-to-${through}.csv"`);
    return res.send(csvDocument(rows));
  } catch (error) {
    return next(error);
  }
});

router.patch('/bookings/:bookingId/visit-status', roles('admin'), [
  body('visitStatus').isIn(['ongoing', 'done', 'cancelled']).withMessage('Choose ongoing, done, or cancelled.'),
  validate
], async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking was not found.' });

    const nextVisitStatus = req.body.visitStatus;
    const checkIn = ['done', 'cancelled'].includes(nextVisitStatus)
      ? await CheckIn.findOne({ bookingId: booking.bookingId })
      : null;
    const statusError = visitStatusError(booking, nextVisitStatus, checkIn, philippinesDate());
    if (statusError) return res.status(409).json({ message: statusError });

    const changes = { visitStatus: nextVisitStatus };
    if (nextVisitStatus === 'cancelled') {
      const checkIn = await CheckIn.findOne({ bookingId: booking.bookingId });
      if (checkIn && checkIn.checkInTime) {
        return res.status(409).json({ message: 'A visitor who has checked in cannot have their booking cancelled.' });
      }
      changes.status = 'cancelled';
    }

    const updated = await Booking.findOneAndUpdate({
      _id: booking._id,
      status: nextVisitStatus === 'cancelled'
        ? { $nin: ['used', 'cancelled'] }
        : { $ne: 'cancelled' },
      paymentStatus: { $ne: 'processing' },
      visitStatus: { $ne: 'cancelled' }
    }, { $set: changes }, { new: true, runValidators: true });
    if (!updated) {
      return res.status(409).json({ message: 'The booking changed while you were editing it. Refresh the list and try again.' });
    }

    if (nextVisitStatus === 'cancelled' &&
        updated.visitDate >= philippinesDate() &&
        !updated.capacityReleasedAt) {
      await releaseCapacity(updated.visitDate, updated.numDivers);
      updated.capacityReleasedAt = new Date();
      await updated.save();
    }
    await recordAudit(
      req,
      nextVisitStatus === 'cancelled' ? 'booking.cancelled' : 'booking.visit_status_changed',
      'booking',
      updated.bookingId,
      { previousVisitStatus: booking.visitStatus, visitStatus: nextVisitStatus, visitDate: updated.visitDate }
    );

    return res.json({
      message: nextVisitStatus === 'cancelled'
        ? 'Booking cancelled. No automatic refund was issued.'
        : `Visit marked ${nextVisitStatus}.`,
      booking: updated
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/bookings/:bookingId/payment-proof', async (req, res, next) => {
  try {
    const payment = await Payment.findOne({
      bookingId: req.params.bookingId,
      status: { $in: ['pending_verification', 'rejected', 'success'] }
    }).sort({ createdAt: -1 });
    if (!payment || !payment.proofPath || path.basename(payment.proofPath) !== payment.proofPath) {
      return res.status(404).json({ message: 'A payment receipt image was not found.' });
    }
    res.setHeader('Content-Type', payment.proofMimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(payment.proofPath, { root: proofDirectory }, error => {
      if (error) return next(error);
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/bookings/:bookingId/payment-review', [
  body('decision').isIn(['approve', 'reject']).withMessage('Choose approve or reject.'),
  body('note').optional({ checkFalsy: true }).trim().isLength({ max: 300 }).withMessage('Review note must be 300 characters or fewer.'),
  validate
], async (req, res, next) => {
  let reviewedPaymentId;
  let reviewedPaymentStatus;
  try {
    const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
    if (req.body.decision === 'reject' && note.length < 5) {
      return res.status(400).json({ message: 'Add a short reason when rejecting a payment receipt.' });
    }
    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      paymentStatus: 'pending_verification',
      status: 'pending'
    });
    if (!booking) return res.status(409).json({ message: 'This booking has no payment receipt awaiting review.' });

    const payment = await Payment.findOne({
      bookingId: booking.bookingId,
      status: 'pending_verification'
    }).sort({ createdAt: -1 });
    if (!payment) return res.status(409).json({ message: 'The submitted payment receipt could not be found.' });

    const approved = req.body.decision === 'approve';
    const reviewedAt = new Date();
    const permit = approved
      ? await createPermit(booking.bookingId, publicBaseUrl(req))
      : null;
    const updatePayment = await Payment.findOneAndUpdate({
      _id: payment._id,
      status: 'pending_verification'
    }, {
      $set: {
        status: approved ? 'success' : 'rejected',
        verifiedAt: reviewedAt,
        verifiedBy: req.user.id,
        reviewNote: approved ? '' : note
      }
    }, { new: true });
    if (!updatePayment) return res.status(409).json({ message: 'The receipt changed while it was being reviewed. Refresh and try again.' });
    reviewedPaymentId = payment._id;
    reviewedPaymentStatus = approved ? 'success' : 'rejected';

    const changes = approved
      ? {
          paymentStatus: 'paid',
          paymentVerifiedAt: reviewedAt,
          paymentVerifiedBy: req.user.id,
          paymentReviewNote: '',
          paidAt: reviewedAt,
          status: 'confirmed',
          qrCode: permit.value,
          qrImage: permit.image
        }
      : {
          paymentStatus: 'rejected',
          paymentReviewNote: note
        };

    const updated = await Booking.findOneAndUpdate({
      _id: booking._id,
      paymentStatus: 'pending_verification',
      status: 'pending'
    }, { $set: changes }, { new: true, runValidators: true });
    if (!updated) {
      await Payment.updateOne({ _id: payment._id, status: approved ? 'success' : 'rejected' }, {
        $set: { status: 'pending_verification' },
        $unset: { verifiedAt: 1, verifiedBy: 1, reviewNote: 1 }
      });
      reviewedPaymentId = null;
      return res.status(409).json({ message: 'The booking changed while it was being reviewed. Refresh and try again.' });
    }
    reviewedPaymentId = null;

    await recordAudit(req, approved ? 'payment.receipt_approved' : 'payment.receipt_rejected', 'booking', booking.bookingId, {
      paymentRef: payment.referenceNo,
      note: approved ? undefined : note
    });
    return res.json({
      message: approved
        ? 'Payment approved. The paid receipt and QR permit are ready.'
        : 'Payment receipt rejected. The visitor can upload a corrected receipt.',
      booking: { bookingId: updated.bookingId, paymentStatus: updated.paymentStatus, paymentRef: updated.paymentRef }
    });
  } catch (error) {
    if (reviewedPaymentId) {
      try {
        await Payment.updateOne({ _id: reviewedPaymentId, status: reviewedPaymentStatus }, {
          $set: { status: 'pending_verification' },
          $unset: { verifiedAt: 1, verifiedBy: 1, reviewNote: 1 }
        });
      } catch (rollbackError) {
        return next(rollbackError);
      }
    }
    return next(error);
  }
});

router.get('/capacity', async (req, res, next) => {
  try {
    const capacities = await Capacity.find({ date: { $gte: philippinesDate() } }).sort({ date: 1 }).limit(90);
    return res.json({ defaultLimit: await defaultLimit(), capacities });
  } catch (error) {
    return next(error);
  }
});

router.put('/capacity/:date', [
  body('maxDivers').optional().isInt({ min: 0, max: 500 }).withMessage('Daily limit must be between 0 and 500.'),
  body('blocked').optional().isBoolean().withMessage('Blocked must be true or false.'),
  validate
], async (req, res, next) => {
  try {
    if (!isRealDateString(req.params.date)) return res.status(400).json({ message: 'Date must use YYYY-MM-DD format.' });
    if (req.body.maxDivers === undefined && req.body.blocked === undefined) {
      return res.status(400).json({ message: 'Provide maxDivers and/or blocked.' });
    }
    const current = await Capacity.findOne({ date: req.params.date });
    const currentCount = current ? current.currentCount : 0;
    if (req.body.maxDivers !== undefined && Number(req.body.maxDivers) < currentCount) {
      return res.status(409).json({ message: `Daily limit cannot be lower than ${currentCount} already reserved divers.` });
    }
    const changes = {};
    if (req.body.maxDivers !== undefined) changes.maxDivers = Number(req.body.maxDivers);
    if (req.body.blocked !== undefined) changes.blocked = req.body.blocked === true || req.body.blocked === 'true';
    const insertDefaults = { currentCount };
    if (req.body.maxDivers === undefined) insertDefaults.maxDivers = current ? current.maxDivers : await defaultLimit();
    const capacity = await Capacity.findOneAndUpdate({ date: req.params.date }, {
      $set: changes,
      $setOnInsert: insertDefaults
    }, { new: true, upsert: true, runValidators: true });
    await recordAudit(req, 'capacity.updated', 'capacity', req.params.date, {
      maxDivers: capacity.maxDivers,
      currentCount: capacity.currentCount,
      blocked: capacity.blocked
    });
    return res.json({ capacity });
  } catch (error) {
    return next(error);
  }
});

router.get('/settings', roles('admin'), async (req, res, next) => {
  try {
    const settings = await Setting.find({ key: { $in: ['fee', 'maxDiversPerDay'] } });
    const values = Object.fromEntries(settings.map(item => [item.key, Number(item.value)]));
    return res.json({
      fee: values.fee === undefined ? 300 : values.fee,
      maxDiversPerDay: values.maxDiversPerDay === undefined ? 30 : values.maxDiversPerDay
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/settings', roles('admin'), [
  body('fee').isInt({ min: 0, max: 100000 }).withMessage('Fee must be between PHP 0 and PHP 100,000.'),
  body('maxDiversPerDay').isInt({ min: 0, max: 500 }).withMessage('Default capacity must be between 0 and 500.'),
  validate
], async (req, res, next) => {
  try {
    await Promise.all([
      Setting.updateOne({ key: 'fee' }, { $set: { value: Number(req.body.fee) }, $setOnInsert: { key: 'fee' } }, { upsert: true }),
      Setting.updateOne({ key: 'maxDiversPerDay' }, { $set: { value: Number(req.body.maxDiversPerDay) }, $setOnInsert: { key: 'maxDiversPerDay' } }, { upsert: true })
    ]);
    await recordAudit(req, 'settings.updated', 'settings', 'system-defaults', {
      fee: Number(req.body.fee),
      maxDiversPerDay: Number(req.body.maxDiversPerDay)
    });
    return res.json({ fee: Number(req.body.fee), maxDiversPerDay: Number(req.body.maxDiversPerDay) });
  } catch (error) {
    return next(error);
  }
});

router.get('/users', roles('admin'), async (req, res, next) => {
  try {
    const users = await User.find().select('name email role createdAt').sort({ createdAt: -1 });
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

router.post('/users', roles('admin'), [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
  body('password').isLength({ min: 10, max: 100 }).withMessage('Password must be at least 10 characters.'),
  body('role').isIn(['admin', 'staff', 'enforcement']).withMessage('Choose a valid role.'),
  validate
], async (req, res, next) => {
  try {
    const password = await bcrypt.hash(req.body.password, 12);
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      password,
      role: req.body.role,
      mustChangePassword: true
    });
    await recordAudit(req, 'staff_account.created', 'user', user.id, { role: user.role });
    return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with that email already exists.' });
    return next(error);
  }
});

router.get('/violations', async (req, res, next) => {
  try {
    const violations = await Violation.find().populate('reportedBy', 'name').sort({ date: -1 }).limit(300);
    return res.json({ violations });
  } catch (error) {
    return next(error);
  }
});

router.patch('/violations/:id/resolve', async (req, res, next) => {
  try {
    const violation = await Violation.findByIdAndUpdate(req.params.id, { status: 'resolved' }, { new: true });
    if (!violation) return res.status(404).json({ message: 'Violation was not found.' });
    await recordAudit(req, 'violation.resolved', 'violation', violation.id, { type: violation.type });
    return res.json({ violation });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
