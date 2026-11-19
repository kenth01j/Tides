// Proposal objective: show a visitor's own booking and receipt status.
(() => {
  const list = document.querySelector('#visitor-bookings');
  if (!list) return;
  const notice = document.querySelector('#bookings-notice');

  function makeLink(text, href, className = 'button secondary') {
    const link = document.createElement('a');
    link.className = className;
    link.href = href;
    link.textContent = text;
    return link;
  }

  async function load() {
    const session = await fetch('/api/visitors/me');
    if (session.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent('/my-bookings.html')}`);
      return;
    }
    const sessionData = await session.json();
    if (!session.ok) throw new Error(sessionData.message || 'Visitor account could not be loaded.');
    document.querySelector('#visitor-account-name').textContent =
      `Signed in as ${sessionData.visitor.name} · ${sessionData.visitor.email}`;

    const response = await fetch('/api/visitors/bookings');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Bookings could not be loaded.');
    list.replaceChildren();
    if (!data.bookings.length) {
      notice.textContent = 'You do not have any bookings yet.';
      return;
    }

    data.bookings.forEach(booking => {
      const card = document.createElement('article');
      card.className = 'visitor-booking-card';
      const heading = document.createElement('h2');
      heading.textContent = `Booking ${booking.bookingId}`;
      const details = document.createElement('p');
      details.textContent =
        `${booking.visitDate} · ${booking.timeSlot} · ${booking.numDivers} diver${booking.numDivers === 1 ? '' : 's'} · PHP ${Number(booking.totalAmount).toLocaleString()}`;
      const status = document.createElement('p');
      status.className = 'visitor-booking-status';
      status.textContent = `Payment: ${booking.paymentStatus.replace('_', ' ')} · Visit: ${booking.status}`;
      card.append(heading, details, status);
      if (booking.paymentStatus === 'pending_verification') {
        const pending = document.createElement('p');
        pending.className = 'muted';
        pending.textContent = 'Your uploaded receipt is waiting for staff review.';
        card.append(pending);
        card.append(makeLink(
          'View full receipt and QR',
          booking.qrCode || `/payment.html?bookingId=${encodeURIComponent(booking.bookingId)}`
        ));
      } else if (booking.paymentStatus === 'rejected') {
        const reason = document.createElement('p');
        reason.className = 'notice';
        reason.textContent = `Receipt needs correction: ${booking.paymentReviewNote || 'Please upload a clear, valid receipt.'}`;
        card.append(reason, makeLink('Upload a corrected receipt', `/payment.html?bookingId=${encodeURIComponent(booking.bookingId)}`));
        card.append(makeLink(
          'View full receipt and QR',
          booking.qrCode || `/payment.html?bookingId=${encodeURIComponent(booking.bookingId)}`
        ));
      } else if (booking.paymentStatus === 'paid' && booking.qrCode) {
        card.append(makeLink('View paid receipt and QR permit', booking.qrCode));
      } else if (booking.paymentStatus === 'pending') {
        card.append(makeLink('Submit payment receipt', `/payment.html?bookingId=${encodeURIComponent(booking.bookingId)}`));
      }
      list.append(card);
    });
  }

  document.querySelector('#visitor-signout').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/visitors/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed. Please try again.');
      location.href = '/';
    } catch (error) {
      notice.textContent = error.message;
    }
  });

  load().catch(error => {
    notice.textContent = error.message;
    notice.className = 'notice';
  });
})();
