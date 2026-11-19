// Proposal objective: expose a paid booking receipt through its signed QR receipt link.
const express = require('express');
const Booking = require('../models/Booking');
const { verifyReceiptToken } = require('../utils/qrGenerator');

const router = express.Router();

router.get('/:bookingId', async (req, res, next) => {
  try {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Receipt ')
      ? authorization.slice('Receipt '.length)
      : req.query.token;
    if (!verifyReceiptToken(req.params.bookingId, token)) {
      return res.status(403).json({ message: 'This receipt link is invalid.' });
    }
    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      paymentStatus: { $in: ['pending_verification', 'rejected', 'paid'] }
    }).select('bookingId visitorName email additionalDiverNames visitDate timeSlot numDivers totalAmount paymentMethod paymentRef paymentProofName paymentProofUploadedAt paymentReviewNote paymentStatus paidAt status visitStatus qrImage');
    if (!booking) return res.status(404).json({ message: 'A booking receipt was not found for this link.' });

    return res.json({
      booking: {
        bookingId: booking.bookingId,
        visitorName: booking.visitorName,
        email: booking.email,
        additionalDiverNames: booking.additionalDiverNames || [],
        visitDate: booking.visitDate,
        timeSlot: booking.timeSlot,
        numDivers: booking.numDivers,
        totalAmount: booking.totalAmount,
        paymentMethod: booking.paymentMethod,
        paymentRef: booking.paymentRef,
        paymentProofName: booking.paymentProofName,
        paymentProofUploadedAt: booking.paymentProofUploadedAt,
        paymentReviewNote: booking.paymentReviewNote,
        paymentStatus: booking.paymentStatus,
        paidAt: booking.paidAt,
        qrImage: booking.qrImage,
        status: booking.status,
        visitStatus: booking.visitStatus,
        permitValid: booking.status === 'confirmed' || booking.status === 'used'
          ? booking.visitStatus !== 'cancelled'
            && booking.paymentStatus === 'paid'
          : false
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
