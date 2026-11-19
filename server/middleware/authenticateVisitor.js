// Proposal objective: verify visitor sessions without granting access to staff accounts.
const jwt = require('jsonwebtoken');
const VisitorAccount = require('../models/VisitorAccount');

module.exports = async function authenticateVisitor(req, res, next) {
  const cookie = (req.headers.cookie || '').split(';')
    .map(value => value.trim())
    .find(value => value.startsWith('tidesVisitorToken='));
  const header = req.get('authorization') || '';
  const token = cookie
    ? cookie.slice('tidesVisitorToken='.length)
    : header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Visitor sign-in is required.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { audience: 'visitor' });
    const visitor = await VisitorAccount.findById(payload.sub).select('name email');
    if (!visitor) return res.status(401).json({ message: 'Visitor account no longer exists.' });
    req.visitor = visitor;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your visitor session is invalid or expired. Please sign in again.' });
    }
    return next(error);
  }
};
