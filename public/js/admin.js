// Proposal objective: LGU operations dashboard, visitor management, capacity settings, users, and compliance.
(() => {
  const root = document.querySelector('#admin-dashboard');
  if (!root || !window.Tides) return;
  const api = window.Tides.api;
  const money = amount => `PHP ${Number(amount || 0).toLocaleString()}`;
  const cell = value => {
    const td = document.createElement('td');
    td.textContent = value == null ? '—' : String(value);
    return td;
  };
  const setNotice = (selector, message, success = false) => {
    const element = document.querySelector(selector);
    element.textContent = message;
    element.className = success ? 'notice success' : 'notice';
  };
  const manilaDateParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((parts, item) => {
    parts[item.type] = item.value;
    return parts;
  }, {});
  const manilaToday = `${manilaDateParts.year}-${manilaDateParts.month}-${manilaDateParts.day}`;

  async function loadStats() {
    const data = await api('/api/admin/stats');
    document.querySelector('#stat-visitors').textContent = data.todayVisitors;
    document.querySelector('#stat-revenue').textContent = money(data.todayRevenue);
    document.querySelector('#stat-capacity').textContent = `${data.capacityUsed} / ${data.capacityLimit}`;
    document.querySelector('#stat-total-revenue').textContent = money(data.totalRevenue);
  }

  async function loadBookings() {
    const params = new URLSearchParams();
    ['filter-date', 'filter-visit-status', 'filter-status', 'filter-payment'].forEach(id => {
      const input = document.getElementById(id);
      if (input.value) params.set(({
        'filter-date': 'date',
        'filter-visit-status': 'visitStatus',
        'filter-status': 'status',
        'filter-payment': 'paymentStatus'
      })[id], input.value);
    });
    const data = await api(`/api/admin/bookings?${params}`);
    const body = document.querySelector('#booking-rows');
    body.replaceChildren();
    data.bookings.forEach(booking => {
      const row = document.createElement('tr');
      [
        booking.bookingId,
        booking.visitorName,
        booking.email,
        booking.visitDate,
        booking.timeSlot,
        String(booking.numDivers),
        money(booking.totalAmount),
        `${booking.paymentMethod || '—'} / ${booking.paymentStatus}`
      ].forEach(value => row.append(cell(value)));
      const proofCell = document.createElement('td');
      if (booking.paymentProofName) {
        const uploadedFile = document.createElement('p');
        uploadedFile.className = 'muted';
        uploadedFile.textContent = `Uploaded: ${booking.paymentProofName}`;
        proofCell.append(uploadedFile);
      }
      if (booking.paymentStatus === 'pending_verification' || booking.paymentStatus === 'rejected') {
        const proof = document.createElement('a');
        proof.href = `/api/admin/bookings/${encodeURIComponent(booking.bookingId)}/payment-proof`;
        proof.target = '_blank';
        proof.rel = 'noopener';
        proof.textContent = 'View receipt image';
        proofCell.append(proof);
      }
      if (booking.paymentStatus === 'pending_verification') {
        const actions = document.createElement('div');
        actions.className = 'payment-review-actions';
        ['approve', 'reject'].forEach(decision => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = decision === 'approve' ? 'small' : 'small coral';
          button.textContent = decision === 'approve' ? 'Approve' : 'Reject';
          button.addEventListener('click', async () => {
            let note = '';
            if (decision === 'reject') {
              note = window.prompt('Why is this payment receipt being rejected?');
              if (note === null) return;
              if (note.trim().length < 5) {
                setNotice('#admin-notice', 'Enter a rejection reason of at least five characters.');
                return;
              }
            } else if (!window.confirm(`Approve the payment receipt for ${booking.bookingId}?`)) {
              return;
            }
            button.disabled = true;
            try {
              const result = await api(`/api/admin/bookings/${encodeURIComponent(booking.bookingId)}/payment-review`, {
                method: 'PATCH',
                body: JSON.stringify({ decision, note })
              });
              setNotice('#admin-notice', result.message, true);
              await Promise.all([loadBookings(), loadStats(), loadAuditLogs()]);
            } catch (error) {
              setNotice('#admin-notice', error.message);
              button.disabled = false;
            }
          });
          actions.append(button);
        });
        proofCell.append(actions);
      }
      row.append(proofCell);
      const currentVisitStatus = booking.status === 'cancelled'
        ? 'cancelled'
        : (booking.visitStatus || 'ongoing');
      const classification = document.createElement('td');
      const currentUser = window.Tides.currentUser();
      if (!currentUser || currentUser.role !== 'admin' || currentVisitStatus === 'cancelled') {
        classification.textContent = currentVisitStatus;
      } else {
        const editor = document.createElement('div');
        editor.className = 'booking-status-editor';
        const select = document.createElement('select');
        select.setAttribute('aria-label', `Visit classification for ${booking.bookingId}`);
        [
          ['ongoing', 'Ongoing'],
          ['done', 'Done'],
          ['cancelled', 'Cancelled']
        ].forEach(([value, label]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          option.selected = value === currentVisitStatus;
          select.append(option);
        });
        const save = document.createElement('button');
        save.className = 'small booking-action-button booking-save-button';
        save.type = 'button';
        save.innerHTML = '<svg class="booking-action-icon save-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span class="booking-action-label">Save</span><span class="booking-action-success" aria-hidden="true">✓</span>';
        const deleteButton = document.createElement('button');
        deleteButton.className = 'small coral booking-action-button booking-cancel-button';
        deleteButton.type = 'button';
        deleteButton.innerHTML = '<svg class="booking-action-icon cancel-trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg><span class="booking-action-label">Cancel</span><span class="booking-action-success" aria-hidden="true">✓</span>';
        deleteButton.setAttribute('aria-label', `Cancel booking ${booking.bookingId}`);

        async function updateVisitStatus(visitStatus) {
          if (visitStatus === 'cancelled' &&
              !window.confirm('Cancel this booking? It will remain in the records, its permit will be invalidated, future capacity may be released, and no automatic refund will be issued.')) {
            return;
          }
          save.disabled = true;
          deleteButton.disabled = true;
          const actionButton = visitStatus === 'cancelled' ? deleteButton : save;
          actionButton.classList.add('is-loading');
          try {
            const result = await api(`/api/admin/bookings/${encodeURIComponent(booking.bookingId)}/visit-status`, {
              method: 'PATCH',
              body: JSON.stringify({ visitStatus })
            });
            setNotice('#admin-notice', result.message, true);
            actionButton.classList.remove('is-loading');
            actionButton.classList.add('is-complete');
            await new Promise(resolve => window.setTimeout(resolve, 650));
            await loadBookings();
            await loadDoneBookings();
            await loadCancelledBookings();
            await loadAuditLogs();
            await loadCapacity();
          } catch (error) {
            actionButton.classList.remove('is-loading');
            setNotice('#admin-notice', error.message);
            save.disabled = false;
            deleteButton.disabled = false;
          }
        }

        save.addEventListener('click', () => updateVisitStatus(select.value));
        deleteButton.addEventListener('click', () => updateVisitStatus('cancelled'));
        const actions = document.createElement('div');
        actions.className = 'booking-status-actions';
        actions.append(save, deleteButton);
        editor.append(select, actions);
        classification.append(editor);
      }
      row.append(classification);
      body.append(row);
    });
    if (!data.bookings.length) {
      const row = document.createElement('tr');
      const message = cell('No bookings match these filters.');
      message.colSpan = 10;
      message.className = 'muted';
      row.append(message);
      body.append(row);
    }
  }

  async function loadDoneBookings() {
    const data = await api('/api/admin/done-bookings');
    const body = document.querySelector('#done-booking-rows');
    body.replaceChildren();
    data.bookings.forEach(booking => {
      const row = document.createElement('tr');
      [
        booking.bookingId,
        booking.visitorName,
        booking.email,
        booking.visitDate,
        booking.timeSlot,
        String(booking.numDivers),
        money(booking.totalAmount),
        `${booking.paymentMethod || '—'} / ${booking.paymentStatus}`
      ].forEach(value => row.append(cell(value)));
      body.append(row);
    });
    if (!data.bookings.length) {
      const row = document.createElement('tr');
      const message = cell('No bookings have been classified as done yet.');
      message.colSpan = 8;
      message.className = 'muted';
      row.append(message);
      body.append(row);
    }
  }

  async function loadCancelledBookings() {
    const data = await api('/api/admin/cancelled-bookings');
    const body = document.querySelector('#cancelled-booking-rows');
    body.replaceChildren();
    data.bookings.forEach(booking => {
      const row = document.createElement('tr');
      [
        booking.bookingId,
        booking.visitorName,
        booking.email,
        booking.visitDate,
        booking.timeSlot,
        String(booking.numDivers),
        money(booking.totalAmount),
        `${booking.paymentMethod || '—'} / ${booking.paymentStatus}`
      ].forEach(value => row.append(cell(value)));
      body.append(row);
    });
    if (!data.bookings.length) {
      const row = document.createElement('tr');
      const message = cell('No bookings have been cancelled.');
      message.colSpan = 8;
      message.className = 'muted';
      row.append(message);
      body.append(row);
    }
  }

  async function loadAuditLogs() {
    const data = await api('/api/admin/audit-logs');
    const body = document.querySelector('#audit-log-rows');
    body.replaceChildren();
    data.logs.forEach(item => {
      const row = document.createElement('tr');
      const details = Object.entries(item.details || {})
        .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1')}: ${value == null ? '—' : value}`)
        .join(' · ');
      [
        new Date(item.createdAt).toLocaleString(),
        item.actorName,
        item.actorRole,
        item.action.replace(/[._]/g, ' '),
        `${item.targetType} ${item.targetId}`,
        details || '—'
      ].forEach(value => row.append(cell(value)));
      body.append(row);
    });
    if (!data.logs.length) {
      const row = document.createElement('tr');
      const message = cell('No staff actions recorded yet.');
      message.colSpan = 6;
      message.className = 'muted';
      row.append(message);
      body.append(row);
    }
  }

  function updateDoneReportFields() {
    const period = document.querySelector('#done-report-period').value;
    const fields = {
      daily: ['#done-report-date-field'],
      monthly: ['#done-report-month-field'],
      yearly: ['#done-report-year-field']
    };
    ['#done-report-date-field', '#done-report-month-field', '#done-report-year-field'].forEach(selector => {
      const field = document.querySelector(selector);
      const visible = (fields[period] || []).includes(selector);
      field.hidden = !visible;
      field.classList.toggle('hidden', !visible);
      field.querySelector('input').required = visible;
    });
  }

  async function downloadDoneReport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const period = form.elements.period.value;
    const params = new URLSearchParams({ period });
    if (period === 'daily') params.set('date', form.elements.date.value);
    if (period === 'monthly') params.set('month', form.elements.month.value);
    if (period === 'yearly') params.set('year', form.elements.year.value);

    const button = document.querySelector('#done-report-download');
    window.TidesButtonMotion.start(button);
    try {
      const response = await fetch(`/api/admin/done-bookings/export.csv?${params}`, {
        credentials: 'same-origin'
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Report download failed (${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tides-done-${period}-${params.get('date') || params.get('month') || params.get('year') || manilaToday}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice('#done-report-notice', 'Done bookings report downloaded.', true);
      window.TidesButtonMotion.complete(button);
    } catch (error) {
      setNotice('#done-report-notice', error.message);
      window.TidesButtonMotion.fail(button);
    }
  }

  async function loadCapacity() {
    const data = await api('/api/admin/capacity');
    document.querySelector('#capacity-default').textContent = data.defaultLimit;
    const body = document.querySelector('#capacity-rows');
    body.replaceChildren();
    data.capacities.forEach(item => {
      const row = document.createElement('tr');
      [item.date, `${item.currentCount} / ${item.maxDivers}`, item.blocked ? 'Blocked' : 'Open'].forEach(value => row.append(cell(value)));
      body.append(row);
    });
  }

  async function loadSettings() {
    const data = await api('/api/admin/settings');
    document.querySelector('#setting-fee').value = data.fee;
    document.querySelector('#setting-capacity').value = data.maxDiversPerDay;
    document.querySelector('#capacity-default').textContent = data.maxDiversPerDay;
  }

  async function loadUsers() {
    const currentUser = window.Tides.currentUser();
    if (!currentUser || currentUser.role !== 'admin') return;
    const data = await api('/api/admin/users');
    const body = document.querySelector('#user-rows');
    body.replaceChildren();
    data.users.forEach(user => {
      const row = document.createElement('tr');
      [user.name, user.email, user.role, new Date(user.createdAt).toLocaleDateString()].forEach(value => row.append(cell(value)));
      body.append(row);
    });
  }

  async function loadViolations() {
    const data = await api('/api/admin/violations');
    const body = document.querySelector('#violation-rows');
    body.replaceChildren();
    data.violations.forEach(item => {
      const row = document.createElement('tr');
      [
        new Date(item.date).toLocaleString(),
        item.type.replace(/_/g, ' '),
        item.bookingId || '—',
        item.description,
        item.reportedBy ? item.reportedBy.name : '—',
        item.status
      ].forEach(value => row.append(cell(value)));
      const action = document.createElement('td');
      if (item.status === 'open') {
        const button = document.createElement('button');
        button.className = 'small secondary';
        button.textContent = 'Resolve';
        button.addEventListener('click', async () => {
          await api(`/api/admin/violations/${item._id}/resolve`, { method: 'PATCH' });
          await Promise.all([loadViolations(), loadAuditLogs()]);
        });
        action.append(button);
      } else action.textContent = '—';
      row.append(action);
      body.append(row);
    });
  }

  document.querySelector('#admin-verify-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const notice = document.querySelector('#admin-verify-notice');
    const result = document.querySelector('#admin-verify-result');
    const submit = form.querySelector('[type="submit"]');
    result.textContent = '';
    window.TidesButtonMotion.start(submit);
    try {
      const data = await api('/api/enforcement/verify', {
        method: 'POST',
        body: JSON.stringify({ code: form.elements.code.value.trim() })
      });
      const booking = data.booking;
      const roster = booking.diverRoster.map((diver, index) =>
        `${index === 0 ? 'Lead diver: ' : ''}${diver.name} (${
          booking.licenseMode === 'group' && index > 0
            ? 'covered by group license'
            : `license ${diver.licenseNumber || 'not recorded'}`
        })`
      ).join(', ');
      result.textContent = `${booking.visitorName} · ${booking.bookingId} · ${booking.numDivers} diver(s) · ${roster} · ${booking.visitDate} ${booking.timeSlot} · PHP ${Number(booking.totalAmount).toLocaleString()} paid via ${(booking.paymentMethod || '').replace('_', ' ')} (ref ${booking.paymentRef || '—'}) · ${booking.paymentStatus} / ${booking.status}`;
      notice.textContent = 'Permit is valid for today.';
      notice.className = 'notice success';
      window.TidesButtonMotion.complete(submit);
    } catch (error) {
      notice.textContent = error.message;
      notice.className = 'notice';
      window.TidesButtonMotion.fail(submit);
    }
  });

  document.querySelector('#booking-filter-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    window.TidesButtonMotion.start(submit);
    try {
      await loadBookings();
      window.TidesButtonMotion.complete(submit);
    } catch (error) {
      setNotice('#admin-notice', error.message);
      window.TidesButtonMotion.fail(submit);
    }
  });
  const walkInForm = document.querySelector('#walk-in-form');
  const walkInDate = walkInForm.elements.visitDate;
  walkInDate.value = manilaToday;
  walkInDate.max = manilaToday;
  walkInForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const additionalNames = document.querySelector('#walk-in-additional-names').value
      .split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    const additionalLicenses = document.querySelector('#walk-in-additional-licenses').value
      .split(/\r?\n/).map(license => license.trim()).filter(Boolean);
    const values = Object.fromEntries(new FormData(form).entries());
    values.numDivers = Number(values.numDivers);
    values.additionalDiverNames = additionalNames;
    values.additionalDiverLicenses = additionalLicenses;
    document.querySelector('#walk-in-receipt-link').replaceChildren();
    window.TidesButtonMotion.start(submit);
    submit.disabled = true;
    try {
      const result = await api('/api/admin/walk-ins', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      setNotice('#walk-in-notice', result.message, true);
      const link = document.createElement('a');
      link.className = 'button secondary';
      link.href = result.booking.qrCode;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = `Open receipt and QR for ${result.booking.bookingId}`;
      document.querySelector('#walk-in-receipt-link').append(link);
      form.reset();
      walkInDate.value = manilaToday;
      const user = window.Tides.currentUser();
      const refreshes = [loadBookings(), loadStats(), loadCapacity()];
      if (user && user.role === 'admin') refreshes.push(loadAuditLogs());
      await Promise.all(refreshes);
      window.TidesButtonMotion.complete(submit);
    } catch (error) {
      setNotice('#walk-in-notice', error.message);
      window.TidesButtonMotion.fail(submit);
    } finally {
      submit.disabled = false;
    }
  });
  const doneReportForm = document.querySelector('#done-report-form');
  doneReportForm.elements.date.value = manilaToday;
  doneReportForm.elements.month.value = manilaToday.slice(0, 7);
  doneReportForm.elements.year.value = manilaToday.slice(0, 4);
  document.querySelector('#done-report-period').addEventListener('change', updateDoneReportFields);
  doneReportForm.addEventListener('submit', downloadDoneReport);
  document.querySelector('#capacity-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    window.TidesButtonMotion.start(submit);
    try {
      const date = form.elements.date.value;
      const maxDivers = form.elements.maxDivers.value;
      const blocked = form.elements.blocked.value;
      const data = {};
      if (maxDivers !== '') data.maxDivers = Number(maxDivers);
      if (blocked !== '') data.blocked = blocked === 'true';
      await api(`/api/admin/capacity/${encodeURIComponent(date)}`, { method: 'PUT', body: JSON.stringify(data) });
      form.reset();
      setNotice('#capacity-notice', 'Capacity settings saved.', true);
      await Promise.all([loadCapacity(), loadAuditLogs()]);
      window.TidesButtonMotion.complete(submit);
    } catch (error) {
      setNotice('#capacity-notice', error.message);
      window.TidesButtonMotion.fail(submit);
    }
  });
  document.querySelector('#settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    window.TidesButtonMotion.start(submit);
    try {
      const settings = Object.fromEntries(new FormData(form).entries());
      await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ fee: Number(settings.fee), maxDiversPerDay: Number(settings.maxDiversPerDay) })
      });
      setNotice('#settings-notice', 'System defaults saved.', true);
      await Promise.all([loadSettings(), loadAuditLogs()]);
      window.TidesButtonMotion.complete(submit);
    } catch (error) {
      setNotice('#settings-notice', error.message);
      window.TidesButtonMotion.fail(submit);
    }
  });
  document.querySelector('#staff-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      form.reset();
      setNotice('#staff-notice', `Created ${result.user.role} account for ${result.user.email}.`, true);
      await Promise.all([loadUsers(), loadAuditLogs()]);
    } catch (error) {
      setNotice('#staff-notice', error.message);
    }
  });
  const user = window.Tides.currentUser();
  document.querySelector('#admin-name').textContent = user ? user.name : 'LGU team';
  if (!user || user.role !== 'admin') {
    doneReportForm.classList.add('hidden');
    document.querySelector('#done-report-notice').classList.add('hidden');
    document.querySelector('#audit-log').classList.add('hidden');
    document.querySelector('.tabs a[href="#audit-log"]').classList.add('hidden');
  }
  updateDoneReportFields();
  if (!user || user.role !== 'admin') {
    document.querySelector('#user-management').classList.add('hidden');
    document.querySelector('#system-settings').classList.add('hidden');
  }
  const initialLoads = [loadStats(), loadBookings(), loadDoneBookings(), loadCancelledBookings(), loadCapacity(), loadViolations()];
  if (user && user.role === 'admin') initialLoads.push(loadUsers(), loadSettings(), loadAuditLogs());
  Promise.all(initialLoads)
    .catch(error => setNotice('#admin-notice', error.message));
  window.setInterval(() => loadStats().catch(error => setNotice('#admin-notice', error.message)), 30000);
})();
