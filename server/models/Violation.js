// Proposal objective: track environmental and access-compliance incidents.
const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
  bookingId: { type: String },
  type: {
    type: String,
    enum: [
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
    ],
    required: true
  },
  description: { type: String, required: true, trim: true },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' }
});

module.exports = mongoose.model('Violation', violationSchema);
