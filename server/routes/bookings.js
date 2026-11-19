// Proposal objective: accept visitor reservations and expose date-specific availability.
const express = require('express');
const { randomUUID } = require('crypto');
const { body, query } = require('express-validator');
const Booking = require('../models/Booking');
const Setting = require('../models/Setting');
const authenticateVisitor = require('../middleware/authenticateVisitor');
const validate = require('../middleware/validate');
const { getCapacitySnapshot, reserveCapacity, releaseCapacity } = require('../utils/capacityChecker');
const { philippinesDate, isRealDateString } = require('../utils/dates');
const {
  validateAdditionalDiverNames,
  validateAdditionalDiverLicenses,
  validateDiverLicenseNumber
} = require('../utils/diverNames');

const router = express.Router();
const timeSlots = ['06:00-08:00', '08:00-10:00', '10:00-12:00', '12:00-14:00'];

router.get('/availability', [
  query('date').custom(isRealDateString).withMessage('Date must use YYYY-MM-DD format.'),
  validate
], async (req, res, next) => {
  try {
    const date = req.query.date;
    const today = philippinesDate();
    const lastAllowed = new Date(`${today}T00:00:00Z`);
    lastAllowed.setUTCDate(lastAllowed.getUTCDate() + 90);
    if (date <= today || date > lastAllowed.toISOString().slice(0, 10)) {
      return res.status(400).json({ message: 'Availability is shown for future dates up to 90 days ahead.' });
    }
    const [capacity, feeSetting] = await Promise.all([getCapacitySnapshot(date), Setting.findOne({ key: 'fee' })]);
    return res.json({
      date,
      fee: feeSetting ? Number(feeSetting.value) : 300,
      maxDivers: capacity.maxDivers,
      currentCount: capacity.currentCount,
      availableDivers: Math.max(0, capacity.maxDivers - capacity.currentCount),
      blocked: capacity.blocked,
      slots: timeSlots.map(time => ({ time, available: !capacity.blocked && capacity.currentCount < capacity.maxDivers }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', authenticateVisitor, [
  body('visitorName').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
  body('phone').trim().isLength({ min: 7, max: 24 }).withMessage('Enter a valid phone number.'),
  body('nationality').trim().isLength({ min: 2, max: 60 }).withMessage('Enter your nationality.'),
  body('diverType').isIn(['recreational', 'technical']).withMessage('Choose a permitted scuba diver type.'),
  body('leadDiverLicenseNumber').custom((licenseNumber, { req }) => {
    const result = validateDiverLicenseNumber(licenseNumber);
    if (!result.valid) throw new Error(result.message);
    req.body.leadDiverLicenseNumber = result.licenseNumber;
    return true;
  }),
  body('licenseMode').isIn(['group', 'individual']).withMessage('Choose group or individual scuba licenses.'),
  body('visitDate').custom(isRealDateString).withMessage('Date must use YYYY-MM-DD format.'),
  body('timeSlot').isIn(timeSlots).withMessage('Choose an available time slot.'),
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
  const { visitDate, numDivers } = req.body;
  try {
    const todayString = philippinesDate();
    const today = new Date(`${todayString}T00:00:00Z`);
    const visit = new Date(`${visitDate}T00:00:00Z`);
    const lastAllowed = new Date(today);
    lastAllowed.setUTCDate(lastAllowed.getUTCDate() + 90);
    if (visit <= today || visit > lastAllowed) {
      return res.status(400).json({ message: 'Bookings must be at least one day ahead and no more than 90 days ahead.' });
    }

    const capacity = await reserveCapacity(visitDate, Number(numDivers));
    if (!capacity) {
      return res.status(409).json({ message: 'This date is full or unavailable. Please choose another date.' });
    }
    reserved = true;
    const feeSetting = await Setting.findOne({ key: 'fee' });
    const fee = feeSetting ? Number(feeSetting.value) : 300;
    const booking = await Booking.create({
      bookingId: `TDS-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
      visitorId: req.visitor.id,
      visitorName: req.body.visitorName,
      email: req.visitor.email,
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
      totalAmount: fee * Number(numDivers)
    });
    return res.status(201).json({
      booking: {
        bookingId: booking.bookingId,
        visitorName: booking.visitorName,
        leadDiverLicenseNumber: booking.leadDiverLicenseNumber,
        licenseMode: booking.licenseMode,
        additionalDiverNames: booking.additionalDiverNames,
        additionalDiverLicenses: booking.additionalDiverLicenses,
        visitDate,
        timeSlot: booking.timeSlot,
        numDivers: booking.numDivers,
        totalAmount: booking.totalAmount
      }
    });
  } catch (error) {
    if (reserved) {
      try {
        await releaseCapacity(visitDate, Number(numDivers));
      } catch (releaseError) {
        return next(releaseError);
      }
    }
    return next(error);
  }
});

module.exports = router;
