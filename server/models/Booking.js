// Proposal objective: persist visitor reservations, payment state, capacity usage, and digital permits.
const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  visitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'VisitorAccount', index: true },
  visitorName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  nationality: { type: String, required: true, trim: true },
  diverType: { type: String, enum: ['recreational', 'technical'], required: true },
  leadDiverLicenseNumber: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  licenseMode: { type: String, enum: ['group', 'individual'], required: true, default: 'individual' },
  additionalDiverNames: {
    type: [{ type: String, trim: true, minlength: 2, maxlength: 100 }],
    default: []
  },
  additionalDiverLicenses: {
    type: [{ type: String, trim: true, minlength: 2, maxlength: 60 }],
    default: []
  },
  visitDate: { type: String, required: true, index: true },
  timeSlot: { type: String, required: true },
  numDivers: { type: Number, required: true, min: 1 },
  totalAmount: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['gcash', 'maya', 'bank_transfer', 'cash'] },
  paymentStatus: { type: String, enum: ['pending', 'pending_verification', 'rejected', 'processing', 'paid', 'failed'], default: 'pending' },
  paymentRef: { type: String },
  paymentProofPath: { type: String },
  paymentProofName: { type: String, maxlength: 255 },
  paymentProofMimeType: { type: String },
  paymentProofUploadedAt: { type: Date },
  paymentVerifiedAt: { type: Date },
  paymentVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paymentReviewNote: { type: String, maxlength: 300 },
  qrCode: { type: String },
  qrImage: { type: String },
  status: { type: String, enum: ['pending', 'confirmed', 'used', 'cancelled'], default: 'pending' },
  visitStatus: { type: String, enum: ['ongoing', 'done', 'cancelled'], default: 'ongoing' },
  capacityReleasedAt: { type: Date },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);
