const test = require('node:test');
const assert = require('node:assert/strict');
const { visitStatusError } = require('../utils/visitStatusRules');

const today = '2026-11-01';
const booking = overrides => ({
  visitStatus: 'ongoing',
  status: 'confirmed',
  paymentStatus: 'paid',
  visitDate: today,
  ...overrides
});

test('checked-out paid visits can be marked done after check-in', () => {
  assert.equal(visitStatusError(
    booking({ status: 'used' }),
    'done',
    { checkInTime: new Date(), checkOutTime: new Date() },
    today
  ), null);
});

test('done status requires a paid, non-future booking and checkout', () => {
  assert.match(visitStatusError(booking({ paymentStatus: 'pending' }), 'done', null, today), /Only paid/);
  assert.match(visitStatusError(booking({ visitDate: '2026-11-02' }), 'done', null, today), /future visit/);
  assert.match(visitStatusError(booking(), 'done', { checkInTime: new Date() }, today), /check-in and check-out/);
});

test('checked-in visitors cannot be cancelled, and cancelled bookings cannot reopen', () => {
  assert.match(visitStatusError(booking({ status: 'used' }), 'cancelled', { checkInTime: new Date() }, today), /cannot have their booking cancelled/);
  assert.match(visitStatusError(booking({ visitStatus: 'cancelled' }), 'ongoing', null, today), /cannot be reopened/);
});

test('a payment in progress blocks visit classification changes', () => {
  assert.match(visitStatusError(booking({ paymentStatus: 'processing' }), 'ongoing', null, today), /payment in progress/);
});
