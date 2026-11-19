// Proposal objective: enforce daily visitor limits and date closures.
const mongoose = require('mongoose');

const capacitySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  maxDivers: { type: Number, required: true, min: 0 },
  currentCount: { type: Number, default: 0, min: 0 },
  blocked: { type: Boolean, default: false }
});

module.exports = mongoose.model('Capacity', capacitySchema);
