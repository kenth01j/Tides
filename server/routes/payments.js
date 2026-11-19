// Proposal objective: accept visitor payment proof for GCash or Maya and await staff verification.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomBytes, randomUUID } = require('crypto');
const multer = require('multer');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const authenticateVisitor = require('../middleware/authenticateVisitor');
const { imageType } = require('../utils/paymentProof');
const { createPermit } = require('../utils/qrGenerator');
const publicBaseUrl = require('../utils/publicBaseUrl');

const router = express.Router();
const proofDirectory = path.resolve(
  process.env.PAYMENT_PROOF_DIR || path.join(__dirname, '..', 'private', 'payment-proofs')
);
fs.mkdirSync(proofDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: proofDirectory,
    filename: (req, file, callback) => callback(null, `${randomUUID()}.proof`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  }
});

function receiveProof(req, res, next) {
  upload.single('proof')(req, res, error => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        message: tooLarge ? 'Payment receipt image must be 5 MB or smaller.' : 'Upload one payment receipt image.'
      });
    }
    if (error) return next(error);
    return next();
  });
}

router.get('/:bookingId/proof', authenticateVisitor, async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      visitorId: req.visitor.id
    }).select('paymentProofPath paymentProofMimeType');
    if (!booking || !booking.paymentProofPath || path.basename(booking.paymentProofPath) !== booking.paymentProofPath) {
      return res.status(404).json({ message: 'An uploaded payment receipt image was not found.' });
    }
    res.setHeader('Content-Type', booking.paymentProofMimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(booking.paymentProofPath, { root: proofDirectory }, error => {
      if (error) return next(error);
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:bookingId', authenticateVisitor, receiveProof, async (req, res, next) => {
  let payment;
  try {
    if (!['gcash', 'maya'].includes(req.body.method)) {
      if (req.file) await fs.promises.unlink(req.file.path);
      return res.status(400).json({ message: 'Choose GCash or Maya.' });
    }
    if (!req.file) return res.status(400).json({ message: 'Upload a JPEG, PNG, or WebP payment receipt image.' });

    const fileBuffer = await fs.promises.readFile(req.file.path);
    const detectedType = imageType(fileBuffer);
    if (!detectedType || detectedType !== req.file.mimetype) {
      await fs.promises.unlink(req.file.path);
      return res.status(400).json({ message: 'The uploaded file is not a supported receipt image.' });
    }

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      visitorId: req.visitor.id
    });
    if (!booking) {
      await fs.promises.unlink(req.file.path);
      return res.status(404).json({ message: 'Booking was not found.' });
    }
    if (booking.status !== 'pending' || !['pending', 'rejected'].includes(booking.paymentStatus)) {
      await fs.promises.unlink(req.file.path);
      return res.status(409).json({ message: 'This booking cannot accept another payment receipt.' });
    }

    const referenceNo = `TDS-PAY-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const permit = await createPermit(booking.bookingId, publicBaseUrl(req));
    payment = await Payment.create({
      bookingId: booking.bookingId,
      method: req.body.method,
      amount: booking.totalAmount,
      referenceNo,
      status: 'pending_verification',
      proofPath: path.basename(req.file.path),
      proofOriginalName: req.file.originalname.slice(0, 255),
      proofMimeType: detectedType,
      uploadedAt: new Date()
    });

    const updated = await Booking.findOneAndUpdate({
      _id: booking._id,
      status: 'pending',
      paymentStatus: { $in: ['pending', 'rejected'] }
    }, {
      $set: {
        paymentMethod: req.body.method,
        paymentStatus: 'pending_verification',
        paymentRef: referenceNo,
        paymentProofPath: payment.proofPath,
        paymentProofName: payment.proofOriginalName,
        paymentProofMimeType: detectedType,
        paymentProofUploadedAt: payment.uploadedAt,
        qrCode: permit.value,
        qrImage: permit.image
      },
      $unset: { paymentReviewNote: 1 }
    }, { new: true, runValidators: true });

    if (!updated) {
      await Payment.deleteOne({ _id: payment._id });
      await fs.promises.unlink(req.file.path);
      return res.status(409).json({ message: 'The booking changed while submitting the receipt. Refresh and try again.' });
    }

    return res.status(202).json({
      message: 'Payment receipt submitted. Your booking will be confirmed after staff verification.',
      booking: {
        bookingId: updated.bookingId,
        visitorName: updated.visitorName,
        email: updated.email,
        additionalDiverNames: updated.additionalDiverNames,
        visitDate: updated.visitDate,
        timeSlot: updated.timeSlot,
        numDivers: updated.numDivers,
        totalAmount: updated.totalAmount,
        paymentStatus: updated.paymentStatus,
        paymentMethod: updated.paymentMethod,
        paymentRef: updated.paymentRef,
        paymentProofName: updated.paymentProofName,
        paymentProofUploadedAt: updated.paymentProofUploadedAt,
        paymentReviewNote: updated.paymentReviewNote,
        paidAt: updated.paidAt,
        status: updated.status,
        permitValid: false,
        qrCode: updated.qrCode,
        qrImage: updated.qrImage
      }
    });
  } catch (error) {
    if (payment) await Payment.deleteOne({ _id: payment._id });
    if (req.file) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') return next(cleanupError);
      }
    }
    return next(error);
  }
});

module.exports = router;
