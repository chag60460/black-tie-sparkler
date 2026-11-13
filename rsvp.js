const form = document.querySelector('#rsvp-form');
const fields = document.querySelector('#reply-fields');
const guestName = document.querySelector('#guest-name');
const phone = document.querySelector('#guest-phone');
const dietaryField = document.querySelector('#dietary-field');
const dietary = document.querySelector('#guest-dietary');
const submit = document.querySelector('#rsvp-submit');
const submitLabel = document.querySelector('#rsvp-submit-label');
const connection = document.querySelector('#rsvp-connection');
const feedback = document.querySelector('#rsvp-feedback');
const formStatus = document.querySelector('#rsvp-status');
const content = document.querySelector('#rsvp-content');
const confirmation = document.querySelector('#rsvp-confirmation');
const confirmationTitle = document.querySelector('#confirmation-title');
const confirmationCopy = document.querySelector('#confirmation-copy');
const endpoint = form.dataset.endpoint.trim();
const configured = /^https:\/\/formspree\.io\/f\/[a-z0-9]+\/?$/i.test(endpoint);
let submitting = false;

function updateAttendance() {
  const attending = form.querySelector('[name="attendance"]:checked')?.value === 'accepts';
  dietaryField.hidden = !attending;
  dietary.disabled = !attending;
}

function validateContact() {
  guestName.setCustomValidity(guestName.value && !guestName.value.trim() ? 'Please enter your name.' : '');
  const value = phone.value.trim();
  const digits = value.replace(/\D/g, '');
  const valid = /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
  phone.setCustomValidity(phone.value && !valid ? 'Enter a phone number with 7 to 15 digits. Spaces, +, parentheses, and dashes are welcome.' : '');
}

function showFeedback(message) {
  feedback.textContent = message;
  feedback.hidden = false;
  feedback.focus();
}

function showConfirmation(attendance) {
  const attending = attendance === 'accepts';
  confirmationTitle.textContent = attending ? 'A place awaits you.' : "You'll be missed.";
  confirmationCopy.textContent = attending
    ? 'A little photoshoot. Some delicious food. And now, your lovely company.'
    : 'Thank you for letting us know. Your warm wishes are part of the celebration, too.';
  const finish = () => {
    form.reset();
    updateAttendance();
    content.hidden = true;
    confirmation.hidden = false;
    document.querySelector('#rsvp-next').hidden = !attending;
    if (!document.querySelector('#experience').hidden) confirmationTitle.focus();
  };
  if (attending) eventFlow.reveal(finish);
  else finish();
}

form.querySelectorAll('[name="attendance"]').forEach(input => input.addEventListener('change', updateAttendance));
guestName.addEventListener('input', validateContact);
phone.addEventListener('input', validateContact);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  validateContact();
  if (!form.reportValidity()) return;
  if (!configured) {
    showFeedback('RSVP delivery is not connected yet. No response has been sent.');
    return;
  }

  const data = new FormData(form);
  data.set('name', guestName.value.trim());
  data.set('phone', phone.value.trim());
  const attendance = data.get('attendance');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  submitting = true;
  fields.disabled = true;
  submit.disabled = true;
  submitLabel.textContent = 'Sending your reply...';
  form.setAttribute('aria-busy', 'true');
  feedback.hidden = true;
  formStatus.textContent = 'Sending your RSVP. Please wait.';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) {
      let message = `Your RSVP could not be accepted (HTTP ${response.status}). Please try again.`;
      if (response.headers.get('content-type')?.includes('application/json')) {
        const result = await response.json();
        if (Array.isArray(result?.errors)) {
          const messages = result.errors
            .filter(error => error && typeof error.message === 'string')
            .map(error => error.message);
          if (messages.length) message = messages.join(' ');
        }
      }
      console.error('RSVP submission rejected:', response.status);
      showFeedback(message);
      return;
    }
    showConfirmation(attendance);
  } catch (error) {
    console.error('RSVP delivery could not be confirmed:', error);
    showFeedback(controller.signal.aborted
      ? 'Delivery took too long to confirm. Your entries are still here. Please check your connection before trying again.'
      : 'We could not confirm delivery. Your entries are still here. Please check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    submitting = false;
    fields.disabled = false;
    submit.disabled = !configured;
    submitLabel.textContent = 'Send my RSVP';
    form.removeAttribute('aria-busy');
    formStatus.textContent = '';
  }
});

updateAttendance();
if (configured) {
  form.action = endpoint;
  connection.hidden = true;
  submit.disabled = false;
} else if (endpoint) {
  connection.textContent = 'The RSVP submission address is invalid. Sending is disabled; please contact the host.';
  console.error('Expected a public https://formspree.io/f/... submission endpoint.');
}
