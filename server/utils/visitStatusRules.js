function visitStatusError(booking, nextStatus, checkIn, today) {
  if (booking.visitStatus === 'cancelled' || booking.status === 'cancelled') {
    return nextStatus === 'cancelled'
      ? null
      : 'A cancelled booking cannot be reopened. Create a new booking instead.';
  }
  if (booking.paymentStatus === 'processing') {
    return 'This booking has a payment in progress. Try again after it completes.';
  }
  if (nextStatus === 'cancelled') {
    if (booking.status === 'used' || (checkIn && checkIn.checkInTime)) {
      return 'A visitor who has checked in cannot have their booking cancelled.';
    }
  }
  if (nextStatus === 'done') {
    if (booking.paymentStatus !== 'paid') return 'Only paid bookings can be marked done.';
    if (booking.visitDate > today) return 'A future visit cannot be marked done.';
    if (!checkIn || !checkIn.checkOutTime) {
      return 'Log the visitor check-in and check-out before marking the visit done.';
    }
  }
  return null;
}

module.exports = { visitStatusError };
