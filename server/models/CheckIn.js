// Proposal objective: record verified visitor entry and exit at the shoal.
const mongoose = require('mongoose');

const checkInSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  checkInTime: { type: Date },
  checkOutTime: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

module.exports = mongoose.model('CheckIn', checkInSchema);
