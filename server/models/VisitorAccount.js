// Proposal objective: store public visitor credentials separately from LGU staff accounts.
const mongoose = require('mongoose');

const visitorAccountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VisitorAccount', visitorAccountSchema);
