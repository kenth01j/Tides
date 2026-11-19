// Proposal objective: upload proof, show upload confirmation, and display the complete booking receipt.
(() => {
  const form = document.querySelector('#payment-form');
  if (!form) return;
  const notice = document.querySelector('#payment-notice');
  const bookingId = new URLSearchParams(location.search).get('bookingId');
  const fileInput = document.querySelector('#payment-proof');
  const fileStatus = document.querySelector('#payment-file-status');
  const preview = document.querySelector('#payment-proof-preview');
  const receiptSection = document.querySelector('#payment-success-receipt');
  let booking;
  let previewUrl;

  function showReceipt(data, uploadedNow = false) {
    booking = data;
    window.TidesReceipt.render(booking, 'payment-receipt');
    const uploadedProof = document.querySelector('#payment-uploaded-proof');
    const uploadedProofImage = document.querySelector('#payment-uploaded-proof-image');
    const uploadedProofLink = document.querySelector('#payment-uploaded-proof-link');
    if (booking.paymentProofName) {
      const proofUrl = `/api/payments/${encodeURIComponent(booking.bookingId)}/proof`;
      uploadedProofImage.src = proofUrl;
      uploadedProofImage.alt = `Uploaded payment receipt: ${booking.paymentProofName}`;
      uploadedProofLink.href = proofUrl;
      uploadedProof.classList.remove('hidden');
    } else {
      uploadedProof.classList.add('hidden');
      uploadedProofImage.removeAttribute('src');
    }
    const uploadStatus = document.querySelector('#payment-upload-success');
    if (uploadedNow) {
      uploadStatus.textContent = `Receipt image uploaded successfully: ${booking.paymentProofName || 'receipt image'}. Your booking remains pending until staff verifies it.`;
      uploadStatus.classList.remove('hidden');
    } else if (booking.paymentProofName) {
      uploadStatus.textContent = `Uploaded file: ${booking.paymentProofName}.`;
      uploadStatus.classList.remove('hidden');
    } else {
      uploadStatus.classList.add('hidden');
    }
    receiptSection.classList.remove('hidden');
    receiptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadBooking() {
    if (!bookingId) {
      notice.textContent = 'No booking was selected. Open My bookings to continue.';
      form.hidden = true;
      return;
    }

    const session = await fetch('/api/visitors/me');
    if (session.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (!session.ok) throw new Error('Visitor account could not be checked.');

    const response = await fetch(`/api/visitors/bookings/${encodeURIComponent(bookingId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Booking could not be loaded.');
    booking = data.booking;
    fileStatus.textContent = booking.paymentProofName
      ? `Previously uploaded: ${booking.paymentProofName}.`
      : 'No file selected.';
    document.querySelector('#payment-booking').textContent = `Booking ${booking.bookingId}`;
    document.querySelector('#payment-total').textContent = `PHP ${Number(booking.totalAmount).toLocaleString()}`;
    document.querySelector('#payment-divers').textContent =
      `${booking.numDivers} diver${booking.numDivers === 1 ? '' : 's'} · ${booking.visitDate} · ${booking.timeSlot}`;
    const diverList = document.querySelector('#payment-diver-roster');
    [booking.visitorName, ...(booking.additionalDiverNames || [])].forEach((name, index) => {
      const item = document.createElement('li');
      item.textContent = `${index === 0 ? 'Lead diver' : `Diver ${index + 1}`}: ${name}`;
      diverList.append(item);
    });

    if (booking.paymentStatus === 'paid') {
      notice.textContent = 'Payment approved. Your full receipt and QR permit are shown below.';
      notice.className = 'notice success';
      form.hidden = true;
      showReceipt(booking);
      return;
    }
    if (booking.paymentStatus === 'pending_verification') {
      notice.textContent = 'Your payment receipt is uploaded and awaiting staff verification.';
      notice.className = 'notice';
      form.hidden = true;
      showReceipt(booking);
      return;
    }
    if (booking.paymentStatus === 'rejected') {
      notice.textContent = `The payment receipt needs correction: ${booking.paymentReviewNote || 'Please upload a clear, valid receipt.'}`;
      notice.className = 'notice';
      if (booking.qrImage) showReceipt(booking);
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.classList.add('hidden');
    preview.removeAttribute('src');
    if (!file) {
      fileStatus.textContent = booking && booking.paymentProofName
        ? `Previously uploaded: ${booking.paymentProofName}. Choose a new file to replace it.`
        : 'No file selected.';
      return;
    }
    fileStatus.textContent = `Selected file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB).`;
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.classList.remove('hidden');
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    notice.textContent = '';
    notice.className = 'notice';
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    window.TidesButtonMotion.start(submit);
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(bookingId)}`, {
        method: 'POST',
        body: new FormData(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Payment receipt could not be submitted.');
      notice.textContent = data.message;
      notice.className = 'notice success';
      fileStatus.textContent = `Uploaded successfully: ${data.booking.paymentProofName}.`;
      form.hidden = true;
      showReceipt(data.booking, true);
      window.TidesButtonMotion.complete(submit);
    } catch (error) {
      notice.textContent = error.message;
      window.TidesButtonMotion.fail(submit);
      submit.disabled = false;
    }
  });

  document.querySelector('#payment-download-receipt').addEventListener('click', () => {
    if (booking) window.TidesReceipt.download(booking);
  });

  loadBooking().catch(error => {
    notice.textContent = error.message;
    form.hidden = true;
  });
})();
