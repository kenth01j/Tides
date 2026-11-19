// Proposal objective: serve the responsive TIDES portals and their REST API.
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { getConfig } = require('./config');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.get('/healthz', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
});
app.get('/admin-login', (req, res) => res.redirect(302, '/admin-login.html'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' }
}));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/visitors/register', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many account registration attempts. Please try again later.' }
}));
app.use('/api/visitors/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' }
}));
app.use('/api/visitors', require('./routes/visitors'));
const bookingSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipFailedRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many booking requests. Please try again in 15 minutes.' }
});
const availabilityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many availability checks. Please try again later.' }
});
app.use('/api/bookings/availability', availabilityLimiter);
app.post('/api/bookings', bookingSubmissionLimiter);
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many payment attempts. Please try again later.' }
}), require('./routes/payments'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/enforcement', require('./routes/enforcement'));
app.use('/api/reports', require('./routes/reports'));

app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body must contain valid JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' });
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Payment receipt image must be 5 MB or smaller.' });
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: 'The submitted information is invalid.' });
  }
  if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid resource identifier.' });
  console.error(error);
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
});

async function start() {
  const config = getConfig();
  app.set('trust proxy', config.trustProxy);
  await mongoose.connect(config.mongoUri);
  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      console.log(`TIDES server listening on port ${config.port}`);
      resolve(server);
    });
    server.once('error', error => {
      mongoose.disconnect().catch(disconnectError => {
        console.error('Unable to disconnect from MongoDB after server startup failed:', disconnectError.message);
      });
      reject(error);
    });
  });
}

if (require.main === module) {
  start().then(server => {
    const shutdown = signal => {
      console.log(`Received ${signal}; shutting down TIDES.`);
      server.close(error => {
        if (error) {
          console.error('Unable to close the TIDES server cleanly:', error.message);
          process.exitCode = 1;
        }
        mongoose.disconnect().catch(disconnectError => {
          console.error('Unable to disconnect from MongoDB cleanly:', disconnectError.message);
          process.exitCode = 1;
        });
      });
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }).catch(error => {
    console.error('Unable to start TIDES:', error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
