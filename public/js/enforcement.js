// Proposal objective: field permit verification, visitor entry/exit logging, and incident reporting.
(() => {
  const form = document.querySelector('#verify-form');
  if (!form) return;
  const api = window.Tides.api;
  const notice = document.querySelector('#enforcement-notice');
  const result = document.querySelector('#permit-result');
  const codeInput = form.elements.code;
  let validBooking = false;

  function showMessage(message, success = false) {
    notice.textContent = message;
    notice.className = success ? 'notice success' : 'notice';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    showMessage('');
    validBooking = false;
    result.classList.add('hidden');
    const submit = form.querySelector('[type="submit"]');
    window.TidesButtonMotion.start(submit);
    try {
      const data = await api('/api/enforcement/verify', {
        method: 'POST',
        body: JSON.stringify({ code: codeInput.value.trim() })
      });
      validBooking = data.valid;
      const booking = data.booking;
      document.querySelector('#permit-name').textContent = booking.visitorName;
      document.querySelector('#permit-id').textContent = booking.bookingId;
      document.querySelector('#permit-date').textContent = `${booking.visitDate} · ${booking.timeSlot}`;
      document.querySelector('#permit-count').textContent = `${booking.numDivers}`;
      document.querySelector('#permit-payment').textContent =
        `PHP ${Number(booking.totalAmount).toLocaleString()} · ${(booking.paymentMethod || '').replace('_', ' ')} · ${booking.paymentStatus}`;
      document.querySelector('#permit-reference').textContent = booking.paymentRef || '—';
      document.querySelector('#permit-status').textContent = `${booking.status} / ${booking.paymentStatus}`;
      const diverList = document.querySelector('#permit-diver-names');
      diverList.replaceChildren();
      booking.diverRoster.forEach((diver, index) => {
        const item = document.createElement('li');
        const licenseText = booking.licenseMode === 'group' && index > 0
          ? 'Covered by the lead diver’s group license'
          : `Scuba license: ${diver.licenseNumber || 'Not recorded'}`;
        item.textContent = `${index === 0 ? 'Lead diver' : `Diver ${index + 1}`}: ${diver.name} · ${licenseText}`;
        diverList.append(item);
      });
      document.querySelector('#permit-checkin').textContent = booking.checkInTime ? new Date(booking.checkInTime).toLocaleString() : 'Not checked in';
      document.querySelector('#permit-checkout').textContent = booking.checkOutTime ? new Date(booking.checkOutTime).toLocaleString() : 'Not checked out';
      document.querySelector('#checkin-button').disabled = Boolean(booking.checkInTime);
      document.querySelector('#checkout-button').disabled = !booking.checkInTime || Boolean(booking.checkOutTime);
      result.classList.remove('hidden');
      showMessage('Permit verified for today.', true);
      window.TidesButtonMotion.complete(submit);
    } catch (error) {
      showMessage(error.message);
      window.TidesButtonMotion.fail(submit);
    }
  });

  async function recordVisit(action) {
    if (!validBooking) return;
    try {
      const response = await api(`/api/enforcement/${action}`, {
        method: 'POST',
        body: JSON.stringify({ code: codeInput.value.trim() })
      });
      showMessage(response.message, true);
      form.requestSubmit();
    } catch (error) {
      showMessage(error.message);
    }
  }
  document.querySelector('#checkin-button').addEventListener('click', () => recordVisit('checkin'));
  document.querySelector('#checkout-button').addEventListener('click', () => recordVisit('checkout'));

  document.querySelector('#violation-form').addEventListener('submit', async event => {
    event.preventDefault();
    const violationForm = event.currentTarget;
    const warning = document.querySelector('#violation-notice');
    warning.textContent = '';
    const body = Object.fromEntries(new FormData(violationForm).entries());
    if (!body.bookingId) delete body.bookingId;
    try {
      await api('/api/enforcement/violations', { method: 'POST', body: JSON.stringify(body) });
      violationForm.reset();
      warning.textContent = 'Violation report submitted.';
      warning.className = 'notice success';
    } catch (error) {
      warning.textContent = error.message;
      warning.className = 'notice';
    }
  });
})();
