// Proposal objective: keep an auditable record of submitted payment proof and staff review.
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, index: true },
  method: { type: String, enum: ['gcash', 'maya', 'bank_transfer', 'cash'], required: true },
  amount: { type: Number, required: true, min: 0 },
  referenceNo: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending_verification', 'success', 'rejected', 'failed'], required: true },
  proofPath: { type: String },
  proofOriginalName: { type: String, maxlength: 255 },
  proofMimeType: { type: String },
  uploadedAt: { type: Date },
  verifiedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNote: { type: String, maxlength: 300 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
