// Proposal objective: render and download complete booking receipts consistently.
(() => {
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function statusLabel(booking) {
    if (booking.status === 'cancelled') return 'BOOKING CANCELLED';
    if (booking.paymentStatus === 'paid') return 'PAYMENT VERIFIED';
    return String(booking.paymentStatus || 'pending').replaceAll('_', ' ').toUpperCase();
  }

  function statusMessage(booking) {
    if (booking.status === 'cancelled') return 'This booking was cancelled. The receipt is retained for your records, but its visit permit is invalid.';
    if (booking.paymentStatus === 'paid') return 'Keep this receipt and present the QR permit on your scheduled visit date.';
    if (booking.paymentStatus === 'rejected') {
      return `Staff could not verify this payment receipt. Upload a corrected image from My bookings.${booking.paymentReviewNote ? ` Staff note: ${booking.paymentReviewNote}` : ''}`;
    }
    if (booking.paymentStatus === 'pending_verification') {
      return 'Your payment receipt was uploaded successfully and is awaiting staff verification. This QR opens the receipt; it is not a valid visit permit until payment is approved.';
    }
    return 'This booking is not yet paid. The QR opens the booking receipt, but is not a valid visit permit.';
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value == null || value === '' ? '—' : String(value);
  }

  function render(booking, prefix) {
    const status = statusLabel(booking);
    setText(`#${prefix}-status`, status);
    setText(`#${prefix}-message`, statusMessage(booking));
    setText(`#${prefix}-id`, booking.bookingId);
    setText(`#${prefix}-visitor`, booking.visitorName);
    setText(`#${prefix}-email`, booking.email);
    setText(`#${prefix}-date`, `${booking.visitDate} · ${booking.timeSlot}`);
    setText(`#${prefix}-divers`, `${booking.numDivers} diver${booking.numDivers === 1 ? '' : 's'}`);
    setText(`#${prefix}-method`, String(booking.paymentMethod || '—').replaceAll('_', ' ').toUpperCase());
    setText(`#${prefix}-reference`, booking.paymentRef);
    setText(`#${prefix}-file`, booking.paymentProofName);
    setText(`#${prefix}-payment-status`, String(booking.paymentStatus || 'pending').replaceAll('_', ' '));
    setText(`#${prefix}-uploaded-at`, formatDate(booking.paymentProofUploadedAt));
    setText(`#${prefix}-paid-at`, formatDate(booking.paidAt));
    setText(`#${prefix}-total-label`, booking.paymentStatus === 'paid' ? 'Total paid' : 'Booking total');
    setText(`#${prefix}-amount`, `PHP ${Number(booking.totalAmount).toLocaleString()}`);

    const roster = document.querySelector(`#${prefix}-diver-list`);
    if (roster) {
      roster.replaceChildren();
      [booking.visitorName, ...(booking.additionalDiverNames || [])].forEach((name, index) => {
        const item = document.createElement('li');
        item.textContent = `${index === 0 ? 'Lead diver' : `Diver ${index + 1}`}: ${name}`;
        roster.append(item);
      });
    }

    const note = document.querySelector(`#${prefix}-review-note`);
    if (note) {
      note.classList.toggle('hidden', !booking.paymentReviewNote);
      const value = note.querySelector('span');
      if (value) value.textContent = booking.paymentReviewNote || '';
    }

    const stamp = document.querySelector(`#${prefix}-status`);
    if (stamp) {
      stamp.classList.toggle('receipt-paid-stamp', booking.paymentStatus === 'paid' && booking.status !== 'cancelled');
      stamp.classList.toggle('receipt-pending-stamp', booking.paymentStatus !== 'paid' || booking.status === 'cancelled');
    }

    const image = document.querySelector(`#${prefix}-qr`);
    if (image) {
      if (booking.qrImage) {
        image.src = booking.qrImage;
        image.classList.remove('hidden');
        const qrMessage = document.querySelector(`#${prefix}-qr-message`);
        if (qrMessage) qrMessage.textContent = booking.permitValid
          ? 'Scan this QR code to open the full paid receipt. Staff can also scan it to verify your visit permit.'
          : 'Scan this QR code to open the full booking receipt. It is not a visit permit until payment is approved.';
      } else {
        image.classList.add('hidden');
        image.removeAttribute('src');
        const qrMessage = document.querySelector(`#${prefix}-qr-message`);
        if (qrMessage) qrMessage.textContent = 'A receipt QR code is not available for this booking.';
      }
    }
  }

  function download(booking) {
    const roster = [booking.visitorName, ...(booking.additionalDiverNames || [])]
      .map((name, index) => `<li>${escapeHtml(index === 0 ? 'Lead diver' : `Diver ${index + 1}`)}: ${escapeHtml(name)}</li>`)
      .join('');
    const rows = [
      ['Receipt / booking ID', booking.bookingId],
      ['Visitor', booking.visitorName],
      ['Email', booking.email],
      ['Visit date & time', `${booking.visitDate} · ${booking.timeSlot}`],
      ['Group size', `${booking.numDivers} diver${booking.numDivers === 1 ? '' : 's'}`],
      ['Payment method', String(booking.paymentMethod || '—').replaceAll('_', ' ').toUpperCase()],
      ['Payment reference', booking.paymentRef || '—'],
      ['Receipt image uploaded', booking.paymentProofName || '—'],
      ['Payment status', String(booking.paymentStatus || 'pending').replaceAll('_', ' ')],
      ['Receipt submitted', formatDate(booking.paymentProofUploadedAt)],
      ['Payment verified', formatDate(booking.paidAt)]
    ];
    const fields = rows.map(([label, value]) =>
      `<div class="line"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`
    ).join('');
    const qr = booking.qrImage
      ? `<img class="qr" src="${escapeHtml(booking.qrImage)}" alt="QR code to open the complete booking receipt">`
      : '';
    const paid = booking.paymentStatus === 'paid' && booking.status !== 'cancelled';
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TIDES receipt ${escapeHtml(booking.bookingId)}</title><style>body{font:16px Arial,sans-serif;color:#142a39;max-width:760px;margin:36px auto;padding:24px;border:1px solid #ccd5d9}header{display:flex;justify-content:space-between;border-bottom:2px solid #efa91c;padding-bottom:15px}.brand{font:700 28px Georgia,serif}.status{font-weight:800;letter-spacing:.1em;color:${paid ? '#18794e' : '#9a5a00'}}h1{font:500 32px Georgia,serif}.line{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px dashed #ccd5d9}.line span{text-align:right;overflow-wrap:anywhere}h2{font-size:18px;margin-top:24px}.total{display:flex;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:2px solid #142a39;font-size:22px}.qr{display:block;width:220px;margin:24px auto}.muted{color:#667780;text-align:center}.note{padding:10px;background:#fff2d6}@media print{body{margin:0;border:0}}</style><body><header><span class="brand">TIDES.</span><span class="status">${escapeHtml(statusLabel(booking))}</span></header><h1>Booking receipt</h1><p>${escapeHtml(statusMessage(booking))}</p>${fields}<h2>Diver roster</h2><ul>${roster}</ul><div class="total"><strong>${paid ? 'Total paid' : 'Booking total'}</strong><strong>PHP ${Number(booking.totalAmount).toLocaleString()}</strong></div>${booking.paymentReviewNote ? `<p class="note"><strong>Staff note:</strong> ${escapeHtml(booking.paymentReviewNote)}</p>` : ''}${qr}<p class="muted">Tabango · Leyte · Philippines</p></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TIDES-Receipt-${booking.bookingId}.html`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.TidesReceipt = { render, download, formatDate };
})();
