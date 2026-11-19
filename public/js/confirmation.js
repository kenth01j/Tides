// Proposal objective: load and display a signed booking receipt, including pending receipts.
(() => {
  const section = document.querySelector('#confirmation-content');
  if (!section) return;
  const notice = document.querySelector('#receipt-notice');
  const bookingId = new URLSearchParams(location.search).get('bookingId');
  const token = new URLSearchParams(location.hash.slice(1)).get('token') ||
    new URLSearchParams(location.search).get('token');

  async function loadReceipt() {
    if (!bookingId || !token) throw new Error('Open the receipt using its signed QR link.');
    const response = await fetch(`/api/receipts/${encodeURIComponent(bookingId)}`, {
      headers: { Authorization: `Receipt ${token}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'The booking receipt could not be loaded.');
    window.TidesReceipt.render(data.booking, 'confirmation');
    section.classList.remove('hidden');
    notice.classList.add('hidden');
    document.title = `Receipt ${data.booking.bookingId} | TIDES`;
    document.querySelector('#download-receipt').addEventListener('click', () => {
      window.TidesReceipt.download(data.booking);
    });
  }

  document.querySelector('#print-receipt').addEventListener('click', () => window.print());
  loadReceipt().catch(error => {
    notice.textContent = error.message;
    notice.className = 'notice';
  });
})();
