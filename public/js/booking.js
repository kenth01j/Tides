// Proposal objective: guide visitors through capacity-aware booking and secure their reservation.
(() => {
  const form = document.querySelector('#booking-form');
  const rulesDialog = document.querySelector('#booking-rules-dialog');
  if (!form || !rulesDialog) return;

  const dateInput = form.elements.visitDate;
  const slotSelect = form.elements.timeSlot;
  const availability = document.querySelector('#availability');
  const notice = document.querySelector('#booking-notice');
  const accessNote = document.querySelector('#booking-access-note');
  const additionalDivers = document.querySelector('#additional-divers');
  const licenseModeHelp = document.querySelector('#license-mode-help');
  const feeSummary = document.querySelector('#booking-fee');
  const checkoutProgress = Array.from(document.querySelectorAll('[data-checkout-step]'));
  const stepLabel = document.querySelector('#booking-step-label');
  const kicker = document.querySelector('#booking-kicker');
  const sectionNumber = document.querySelector('#booking-section-number');
  const sectionTitle = document.querySelector('#booking-dialog-title');
  const sectionDescription = document.querySelector('#booking-step-description');
  const summaryVisit = document.querySelector('#booking-summary-visit');
  const summaryDivers = document.querySelector('#booking-summary-divers');
  const summaryTotal = document.querySelector('#booking-summary-total');
  const originalGrid = form.querySelector('.form-grid');
  const additionalLicenseValues = [];
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const lastDay = new Date(tomorrow);
  lastDay.setDate(lastDay.getDate() + 89);
  dateInput.min = localDate(tomorrow);
  dateInput.max = localDate(lastDay);

  const fieldFor = id => originalGrid.querySelector(`#${id}`).closest('.field');
  const stepDefinitions = [
    {
      title: 'Visit details',
      description: 'Choose your visit date, arrival time, group size, and diver type.',
      label: 'Step 1 of 4 · Visit details',
      fields: ['visitDate', 'timeSlot', 'numDivers', 'diverType']
    },
    {
      title: 'Diver information',
      description: 'Add the lead diver’s contact information and scuba license details.',
      label: 'Step 2 of 4 · Diver information',
      fields: ['visitorName', 'email', 'phone', 'nationality', 'leadDiverLicenseNumber', 'licenseMode']
    },
    {
      title: 'Reservation review',
      description: 'Review your visit and diver details before creating your reservation.',
      label: 'Step 3 of 4 · Reservation review',
      fields: []
    }
  ];
  const steps = stepDefinitions.map((definition, index) => {
    const section = document.createElement('section');
    section.className = 'booking-step';
    section.hidden = index !== 0;
    section.dataset.step = String(index);
    section.setAttribute('aria-labelledby', `booking-step-title-${index}`);

    const heading = document.createElement('h3');
    heading.id = `booking-step-title-${index}`;
    heading.tabIndex = -1;
    heading.textContent = definition.title;
    section.append(heading);

    if (index < 2) {
      const grid = document.createElement('div');
      grid.className = 'form-grid booking-step-grid';
      definition.fields.forEach(id => grid.append(fieldFor(id)));
      if (index === 1) grid.append(additionalDivers);
      section.append(grid);
    }

    const actions = document.createElement('div');
    actions.className = 'booking-step-actions';
    if (index > 0) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'button secondary';
      back.textContent = '← Back';
      back.addEventListener('click', () => showStep(index - 1));
      actions.append(back);
    } else {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'button secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => { location.href = '/'; });
      actions.append(cancel);
    }

    const next = document.createElement('button');
    next.type = index === 2 ? 'submit' : 'button';
    next.className = 'booking-next tides-motion-control';
    next.textContent = index === 2 ? 'Reserve & continue to payment →' : 'Continue →';
    if (index < 2) next.addEventListener('click', () => advanceStep(index));
    actions.append(next);
    section.append(actions);
    form.append(section);
    return section;
  });

  const review = document.createElement('dl');
  review.className = 'booking-review';
  steps[2].insertBefore(review, steps[2].querySelector('.booking-step-actions'));
  const reviewIntro = document.createElement('p');
  reviewIntro.className = 'muted';
  reviewIntro.textContent = 'Check your visit and diver details before creating your booking.';
  steps[2].insertBefore(reviewIntro, review);

  const agreement = document.createElement('label');
  agreement.className = 'booking-agreement';
  const agreementInput = document.createElement('input');
  agreementInput.type = 'checkbox';
  agreementInput.required = true;
  agreementInput.id = 'booking-agreement';
  const agreementText = document.createElement('span');
  agreementText.textContent = 'I have read the visitor rules and understand that freediving, snorkeling, and touching or disturbing marine life are prohibited at Kimud Shoal.';
  agreement.append(agreementInput, agreementText);
  steps[2].insertBefore(agreement, steps[2].querySelector('.booking-step-actions'));
  const rulesLink = document.createElement('a');
  rulesLink.className = 'booking-review-rules-link booking-rules-trigger';
  rulesLink.type = 'button';
  rulesLink.dataset.openBookingRules = '';
  rulesLink.textContent = 'Review the ordinance and visitor rules';
  steps[2].insertBefore(rulesLink, steps[2].querySelector('.booking-step-actions'));

  originalGrid.remove();
  steps[0].insertBefore(availability, steps[0].querySelector('.booking-step-grid'));
  form.insertBefore(steps[0], notice);
  let activeStep = 0;
  let requestNumber = 0;
  let feePerDiver = 300;

  function updateSummary() {
    const numberOfDivers = Number(form.elements.numDivers.value) || 1;
    const date = dateInput.value;
    const time = slotSelect.value;
    summaryVisit.textContent = date
      ? `${date}${time ? ` · ${time}` : ''}`
      : 'Choose a visit date and time';
    summaryDivers.textContent = `${numberOfDivers} diver${numberOfDivers === 1 ? '' : 's'}`;
    summaryTotal.textContent = `PHP ${(feePerDiver * numberOfDivers).toLocaleString()}`;
  }

  function showStep(index, focus = true) {
    activeStep = index;
    steps.forEach((step, stepIndex) => { step.hidden = stepIndex !== index; });
    checkoutProgress.forEach((item, stepIndex) => {
      const current = stepIndex === index;
      const complete = stepIndex < index;
      const stepButton = item.querySelector('[data-booking-step]');
      item.classList.toggle('is-current', current);
      item.classList.toggle('is-complete', complete);
      if (stepButton) stepButton.disabled = stepIndex > index;
      if (current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.querySelector('.checkout-step-icon').textContent = complete ? '✓' : String(stepIndex + 1);
    });
    stepLabel.textContent = stepDefinitions[index].label;
    kicker.textContent = stepDefinitions[index].label.toUpperCase();
    sectionNumber.textContent = String(index + 1).padStart(2, '0');
    sectionTitle.textContent = stepDefinitions[index].title;
    sectionDescription.textContent = stepDefinitions[index].description;
    notice.textContent = '';
    notice.className = 'notice';
    if (focus) steps[index].querySelector('h3').focus();
    if (index === 2) renderReview();
    updateSummary();
  }

  function updateLicenseModeHelp() {
    licenseModeHelp.textContent = form.elements.licenseMode.value === 'group'
      ? 'The lead diver’s scuba license will be recorded as covering the group. Additional divers only need to provide their full names.'
      : 'Each diver must provide their own scuba license number.';
  }

  function renderAdditionalDivers() {
    const count = Number(form.elements.numDivers.value);
    const existingNames = Array.from(additionalDivers.querySelectorAll('[data-diver-name]'), input => input.value);
    const existingLicenses = Array.from(additionalDivers.querySelectorAll('[data-diver-license]'), input => input.value);
    existingLicenses.forEach((license, index) => { additionalLicenseValues[index] = license; });
    additionalDivers.replaceChildren();
    additionalDivers.hidden = !Number.isInteger(count) || count < 2;
    if (additionalDivers.hidden) return;

    const legend = document.createElement('legend');
    legend.textContent = 'Other divers';
    const help = document.createElement('p');
    help.className = 'muted';
    help.textContent = form.elements.licenseMode.value === 'group'
      ? 'The lead diver above counts as diver 1. Enter each accompanying diver’s full name; the lead diver’s group license covers them.'
      : 'The lead diver above counts as diver 1. Enter each accompanying diver’s full name and individual scuba license number.';
    const nameGrid = document.createElement('div');
    nameGrid.className = 'diver-name-grid';
    additionalDivers.append(legend, help, nameGrid);

    for (let index = 1; index < count; index += 1) {
      const field = document.createElement('div');
      field.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = `additional-diver-${index + 1}`;
      label.textContent = `Diver ${index + 1} full name`;
      const input = document.createElement('input');
      input.id = label.htmlFor;
      input.type = 'text';
      input.required = true;
      input.minLength = 2;
      input.maxLength = 100;
      input.autocomplete = 'off';
      input.dataset.diverName = '';
      input.value = existingNames[index - 1] || '';
      field.append(label, input);
      if (form.elements.licenseMode.value === 'individual') {
        const licenseLabel = document.createElement('label');
        licenseLabel.htmlFor = `additional-diver-license-${index + 1}`;
        licenseLabel.textContent = `Diver ${index + 1} scuba license number`;
        const licenseInput = document.createElement('input');
        licenseInput.id = licenseLabel.htmlFor;
        licenseInput.type = 'text';
        licenseInput.required = true;
        licenseInput.minLength = 2;
        licenseInput.maxLength = 60;
        licenseInput.autocomplete = 'off';
        licenseInput.dataset.diverLicense = '';
        licenseInput.value = existingLicenses[index - 1] || additionalLicenseValues[index - 1] || '';
        field.append(licenseLabel, licenseInput);
      }
      nameGrid.append(field);
    }
  }

  async function loadAvailability() {
    const date = dateInput.value;
    const selectedTime = slotSelect.value;
    const currentRequest = ++requestNumber;
    slotSelect.disabled = true;
    slotSelect.replaceChildren(new Option('Checking available times…', ''));
    if (!date) {
      availability.textContent = 'Choose a visit date to view available spaces and time slots.';
      slotSelect.replaceChildren(new Option('Choose a date first', ''));
      updateSummary();
      return null;
    }

    availability.textContent = 'Checking availability…';
    try {
      const response = await fetch(`/api/bookings/availability?date=${encodeURIComponent(date)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Availability could not be loaded.');
      if (currentRequest !== requestNumber) return null;
      feePerDiver = Number(data.fee);
      feeSummary.textContent = `PHP ${feePerDiver.toLocaleString()} per diver`;
      updateSummary();
      if (data.blocked || data.availableDivers < Number(form.elements.numDivers.value)) {
        availability.textContent = data.blocked
          ? 'This date is blocked for visits.'
          : data.availableDivers < 1
            ? 'This date is fully booked.'
            : `Only ${data.availableDivers} diver spaces remain; reduce your group size or choose another date.`;
        slotSelect.replaceChildren(new Option('No available times', ''));
        return data;
      }

      availability.replaceChildren();
      const summary = document.createElement('span');
      summary.textContent = `${data.availableDivers} of ${data.maxDivers} diver spaces remain.`;
      availability.append(summary);
      const slots = document.createElement('div');
      slots.className = 'slot-list';
      slotSelect.replaceChildren(new Option('Choose an arrival time', ''));
      data.slots.forEach(slot => {
        const pill = document.createElement('span');
        pill.className = `slot-pill${slot.available ? '' : ' unavailable'}`;
        pill.textContent = `${slot.time}${slot.available ? '' : ' (full)'}`;
        slots.append(pill);
        const option = new Option(slot.time, slot.time);
        option.disabled = !slot.available;
        slotSelect.append(option);
      });
      if (data.slots.some(slot => slot.available && slot.time === selectedTime)) {
        slotSelect.value = selectedTime;
      }
      availability.append(slots);
      slotSelect.disabled = false;
      updateSummary();
      return data;
    } catch (error) {
      if (currentRequest !== requestNumber) return null;
      availability.textContent = error.message;
      slotSelect.replaceChildren(new Option('Availability unavailable', ''));
      return null;
    }
  }

  function validateStep(index) {
    const invalidControl = Array.from(steps[index].querySelectorAll('input, select, textarea'))
      .find(control => !control.disabled && !control.checkValidity());
    if (invalidControl) {
      invalidControl.reportValidity();
      return false;
    }
    return true;
  }

  function appendReviewRow(label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    review.append(term, detail);
  }

  function renderReview() {
    steps[2].querySelector('[data-review-roster]')?.remove();
    review.replaceChildren();
    const numberOfDivers = Number(form.elements.numDivers.value);
    appendReviewRow('Visit date', form.elements.visitDate.value);
    appendReviewRow('Arrival time', form.elements.timeSlot.value);
    appendReviewRow('Divers', String(numberOfDivers));
    appendReviewRow('Diver type', form.elements.diverType.selectedOptions[0].textContent);
    appendReviewRow('Lead diver', form.elements.visitorName.value.trim());
    appendReviewRow('Account email', form.elements.email.value.trim());
    appendReviewRow('Mobile', form.elements.phone.value.trim());
    appendReviewRow('Nationality', form.elements.nationality.value);
    appendReviewRow('License arrangement', form.elements.licenseMode.value === 'group' ? 'Group license' : 'Individual licenses');
    const total = feePerDiver * numberOfDivers;
    appendReviewRow('Total environmental fee', `PHP ${total.toLocaleString()} (${feePerDiver.toLocaleString()} × ${numberOfDivers})`);
    updateSummary();

    const roster = document.createElement('div');
    roster.className = 'booking-review-roster';
    const rosterTitle = document.createElement('strong');
    rosterTitle.textContent = 'Diver licenses';
    roster.append(rosterTitle);
    const names = [form.elements.visitorName.value.trim(), ...Array.from(additionalDivers.querySelectorAll('[data-diver-name]'), input => input.value.trim())];
    const licenses = [form.elements.leadDiverLicenseNumber.value.trim(), ...Array.from(additionalDivers.querySelectorAll('[data-diver-license]'), input => input.value.trim())];
    names.forEach((name, index) => {
      const item = document.createElement('p');
      item.textContent = `${index === 0 ? 'Lead diver' : `Diver ${index + 1}`}: ${name} · ${
        form.elements.licenseMode.value === 'group' && index > 0
          ? 'Covered by the lead diver’s group license'
          : `License ${licenses[index] || ''}`
      }`;
      roster.append(item);
    });
    review.after(roster);
    roster.dataset.reviewRoster = 'true';
  }

  async function loadVisitor() {
    const response = await fetch('/api/visitors/me');
    if (response.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent('/book.html')}`);
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Visitor account could not be checked.');
    if (!form.elements.visitorName.value) form.elements.visitorName.value = data.visitor.name;
    form.elements.email.value = data.visitor.email;
  }

  async function advanceStep(index) {
    notice.textContent = '';
    if (!validateStep(index)) return;
    if (index === 0) {
      const data = await loadAvailability();
      if (!data || data.blocked || data.availableDivers < Number(form.elements.numDivers.value)) {
        notice.textContent = availability.textContent || 'Please choose a date with enough spaces for your group.';
        return;
      }
    }
    showStep(index + 1);
  }

  async function submitBooking() {
    notice.textContent = '';
    if (!validateStep(2)) return;
    const submit = steps[2].querySelector('[type="submit"]');
    submit.disabled = true;
    window.TidesButtonMotion.start(submit);
    const body = Object.fromEntries(new FormData(form).entries());
    body.numDivers = Number(body.numDivers);
    body.additionalDiverNames = Array.from(additionalDivers.querySelectorAll('[data-diver-name]'), input => input.value.trim());
    body.additionalDiverLicenses = body.licenseMode === 'individual'
      ? Array.from(additionalDivers.querySelectorAll('[data-diver-license]'), input => input.value.trim())
      : [];
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) {
        const firstError = Array.isArray(data.errors) && data.errors[0];
        throw new Error(firstError ? firstError.message : data.message || 'Booking could not be completed.');
      }
      window.TidesButtonMotion.complete(submit);
      window.setTimeout(() => {
        location.href = `/payment.html?bookingId=${encodeURIComponent(data.booking.bookingId)}`;
      }, 450);
    } catch (error) {
      notice.textContent = error.message;
      window.TidesButtonMotion.fail(submit);
    } finally {
      submit.disabled = false;
    }
  }

  dateInput.addEventListener('change', loadAvailability);
  slotSelect.addEventListener('change', updateSummary);
  form.elements.numDivers.addEventListener('input', () => {
    renderAdditionalDivers();
    updateSummary();
  });
  form.elements.numDivers.addEventListener('change', () => {
    if (dateInput.value) loadAvailability();
  });
  form.elements.licenseMode.addEventListener('change', () => {
    updateLicenseModeHelp();
    renderAdditionalDivers();
  });
  document.querySelectorAll('[data-open-booking-rules]').forEach(button => {
    button.addEventListener('click', () => rulesDialog.showModal());
  });
  checkoutProgress.forEach(item => {
    const stepButton = item.querySelector('[data-booking-step]');
    stepButton.addEventListener('click', () => {
      const targetStep = Number(stepButton.dataset.bookingStep);
      if (targetStep <= activeStep) showStep(targetStep);
    });
  });
  document.querySelector('#booking-rules-close').addEventListener('click', () => rulesDialog.close());
  rulesDialog.addEventListener('click', event => {
    if (event.target === rulesDialog) rulesDialog.close();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (activeStep < 2) advanceStep(activeStep);
    else submitBooking();
  });

  updateLicenseModeHelp();
  renderAdditionalDivers();
  updateSummary();
  showStep(0, false);
  loadVisitor().catch(error => {
    accessNote.textContent = error.message;
    form.hidden = true;
  });
})();
