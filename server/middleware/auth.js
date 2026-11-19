// Proposal objective: protect staff endpoints with verified JWT identity.
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const cookie = (req.headers.cookie || '').split(';')
    .map(value => value.trim())
    .find(value => value.startsWith('tidesToken='));
  const token = cookie
    ? cookie.slice('tidesToken='.length)
    : header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { audience: 'staff' });
    const user = await User.findById(payload.sub).select('name email role mustChangePassword');
    if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
    const allowedDuringPasswordChange = req.baseUrl === '/api/auth' &&
      ['/me', '/change-password'].includes(req.path);
    if (user.mustChangePassword && !allowedDuringPasswordChange) {
      return res.status(403).json({ message: 'Change your temporary password before continuing.' });
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session is invalid or expired. Please sign in again.' });
    }
    return next(error);
  }
};
