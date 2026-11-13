import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../rsvp.js', import.meta.url), 'utf8');

function harness(attendance, response) {
  const elements = new Map();
  let submitHandler;
  let reveals = 0;
  let request;
  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, {
        value: selector === '#guest-name' ? ' Guest ' : selector === '#guest-phone' ? ' +1 202 555 0123 ' : '',
        hidden: selector === '#rsvp-confirmation' || selector === '#rsvp-next',
        dataset: { endpoint: 'https://formspree.io/f/example' },
        textContent: '',
        setCustomValidity() {},
        setAttribute() {},
        removeAttribute() {},
        focus() {},
        addEventListener(type, handler) {
          if (selector === '#rsvp-form' && type === 'submit') submitHandler = handler;
        },
        querySelector() { return { value: attendance }; },
        querySelectorAll() { return []; },
        reportValidity() { return true; },
        reset() {}
      });
    }
    return elements.get(selector);
  }
  class FormDataFixture extends Map {
    constructor() { super([['attendance', attendance]]); }
  }
  const context = {
    document: { querySelector: element },
    FormData: FormDataFixture,
    AbortController, setTimeout, clearTimeout,
    console: { error() {} },
    fetch: async (url, options) => { request = { url, options }; return response; },
    eventFlow: { reveal(callback) { reveals++; element('#experience').hidden = true; callback(); } }
  };
  vm.runInNewContext(source, context);
  return {
    elements, element,
    submit: () => submitHandler({ preventDefault() {} }),
    reveals: () => reveals,
    request: () => request
  };
}

test('only a successful accepting RSVP starts Gold dust', async () => {
  const test = harness('accepts', new Response('{}', { status: 200 }));
  await test.submit();
  assert.equal(test.reveals(), 1);
  assert.equal(test.request().options.body.get('name'), 'Guest');
  assert.equal(test.request().options.body.get('phone'), '+1 202 555 0123');
  assert.equal(test.element('#rsvp-next').hidden, false);
  assert.equal(test.element('#reply-fields').disabled, false);
});

test('a successful decline keeps the simple confirmation', async () => {
  const test = harness('declines', new Response('{}', { status: 200 }));
  await test.submit();
  assert.equal(test.reveals(), 0);
  assert.equal(test.element('#confirmation-title').textContent, "You'll be missed.");
  assert.equal(test.element('#rsvp-next').hidden, true);
});

test('a rejected RSVP stays on the form and does not reveal the event', async () => {
  const test = harness('accepts', new Response(JSON.stringify({ errors: [{ message: 'Please try again.' }] }), {
    status: 422, headers: { 'Content-Type': 'application/json' }
  }));
  await test.submit();
  assert.equal(test.reveals(), 0);
  assert.equal(test.element('#rsvp-feedback').hidden, false);
  assert.equal(test.element('#rsvp-feedback').textContent, 'Please try again.');
  assert.equal(test.element('#guest-name').value, ' Guest ');
  assert.equal(test.element('#reply-fields').disabled, false);
});
