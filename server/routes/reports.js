// Proposal objective: calculate operational KPIs, chart-ready trends, and CSV revenue reports.
const express = require('express');
const Booking = require('../models/Booking');
const CheckIn = require('../models/CheckIn');
const Payment = require('../models/Payment');
const Violation = require('../models/Violation');
const authenticate = require('../middleware/auth');
const roles = require('../middleware/roles');
const { philippinesDate } = require('../utils/dates');
const { csvDocument } = require('../utils/csv');

const router = express.Router();
router.use(authenticate, roles('admin', 'staff'));

function periodStart(period) {
  const start = new Date(`${philippinesDate()}T00:00:00Z`);
  if (period === 'daily') start.setUTCDate(start.getUTCDate());
  else if (period === 'weekly') start.setUTCDate(start.getUTCDate() - 6);
  else if (period === 'monthly') start.setUTCDate(start.getUTCDate() - 29);
  else return null;
  return start.toISOString().slice(0, 10);
}

router.get('/', async (req, res, next) => {
  try {
    const period = req.query.period || 'weekly';
    const start = periodStart(period);
    if (!start) return res.status(400).json({ message: 'Period must be daily, weekly, or monthly.' });
    const from = start;
    const through = philippinesDate();
    const startAt = new Date(`${from}T00:00:00+08:00`);
    const visitRange = { $gte: from, $lte: through };
    const [bookings, paid, activePaid, checkIns, violations, noPermit] = await Promise.all([
      Booking.countDocuments({ visitDate: visitRange }),
      Booking.find({ visitDate: visitRange, paymentStatus: 'paid' }).select('visitDate numDivers totalAmount paymentMethod createdAt paidAt bookingId'),
      Booking.find({
        visitDate: visitRange,
        paymentStatus: 'paid',
        status: { $ne: 'cancelled' },
        visitStatus: { $ne: 'cancelled' }
      }).select('visitDate numDivers'),
      CheckIn.countDocuments({ checkInTime: { $gte: startAt, $lte: new Date() } }),
      Violation.countDocuments({ date: { $gte: startAt, $lte: new Date() } }),
      Violation.countDocuments({ type: 'no_permit', date: { $gte: startAt, $lte: new Date() } })
    ]);
    const bookingIds = paid.map(booking => booking.bookingId);
    const payments = bookingIds.length ? await Payment.aggregate([
      { $match: { bookingId: { $in: bookingIds }, status: 'success' } },
      { $group: { _id: '$method', transactions: { $sum: 1 }, amount: { $sum: '$amount' } } }
    ]) : [];

    const daily = new Map();
    const revenueByDay = new Map();
    const paymentMethods = { gcash: 0, maya: 0, cash: 0, other: 0 };
    let visitorCount = 0;
    let revenue = 0;
    let processingTotal = 0;
    let processingCount = 0;
    for (const booking of activePaid) {
      daily.set(booking.visitDate, (daily.get(booking.visitDate) || 0) + booking.numDivers);
      visitorCount += booking.numDivers;
    }
    for (const booking of paid) {
      revenueByDay.set(booking.visitDate, (revenueByDay.get(booking.visitDate) || 0) + booking.totalAmount);
      const method = Object.hasOwn(paymentMethods, booking.paymentMethod) && booking.paymentMethod !== 'other'
        ? booking.paymentMethod
        : 'other';
      paymentMethods[method] += booking.totalAmount;
      revenue += booking.totalAmount;
      if (booking.paidAt) {
        processingTotal += booking.paidAt.getTime() - booking.createdAt.getTime();
        processingCount++;
      }
    }

    const days = [];
    for (let cursor = new Date(`${from}T00:00:00Z`), end = new Date(`${through}T00:00:00Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    const cashless = paymentMethods.gcash + paymentMethods.maya;
    const recordedRevenue = payments.reduce((sum, item) => sum + item.amount, 0);
    const accuracy = Math.max(revenue, recordedRevenue) === 0 ? 100 : Math.max(0, 100 - Math.abs(revenue - recordedRevenue) / Math.max(revenue, recordedRevenue) * 100);
    return res.json({
      period,
      kpis: {
        platformAdoptionRate: visitorCount + noPermit ? visitorCount / (visitorCount + noPermit) * 100 : 0,
        complianceRate: visitorCount ? checkIns / activePaid.length * 100 : 0,
        cashlessTransactionRate: revenue ? cashless / revenue * 100 : 0,
        averageProcessingMinutes: processingCount ? processingTotal / processingCount / 60000 : 0,
        revenueAccuracy: accuracy,
        visitors: visitorCount,
        revenue,
        bookings,
        violations
      },
      charts: {
        labels: days,
        dailyVisitors: days.map(day => daily.get(day) || 0),
        revenueTrend: days.map(day => revenueByDay.get(day) || 0),
        paymentMethods: Object.entries(paymentMethods).map(([method, amount]) => ({ method, amount }))
      },
      payments
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/export.csv', async (req, res, next) => {
  try {
    const period = req.query.period || 'weekly';
    const start = periodStart(period);
    if (!start) return res.status(400).json({ message: 'Period must be daily, weekly, or monthly.' });
    const bookings = await Booking.find({
      visitDate: { $gte: start, $lte: philippinesDate() },
      paymentStatus: 'paid'
    }).sort({ visitDate: 1, createdAt: 1 });
    const rows = [
      ['Booking ID', 'Visitor', 'Email', 'Visit date', 'Time slot', 'Divers', 'Amount PHP', 'Payment method', 'Payment reference', 'Visit classification', 'Booking status'],
      ...bookings.map(item => [
        item.bookingId, item.visitorName, item.email, item.visitDate, item.timeSlot,
        item.numDivers, item.totalAmount, item.paymentMethod, item.paymentRef,
        item.status === 'cancelled' ? 'cancelled' : item.visitStatus, item.status
      ])
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tides-${period}-report.csv"`);
    return res.send(csvDocument(rows));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
