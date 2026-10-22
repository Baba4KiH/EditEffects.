import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHandler } from '../server/handler.mjs';

const source = await readFile(new URL('../form.js', import.meta.url), 'utf8');
function mount({ endpoint = '/api/brief', response = { ok: true }, status = 200, trap = '', valid = true, fetchImpl } = {}) {
  const values = { name: 'Тест', contact: '@test', task: 'Ролик', website: trap };
  const result = { textContent: '' }, button = { disabled: false, innerHTML: 'Запланировать проект' }, note = { textContent: '' };
  const handlers = {}, requests = [], copies = [];
  const form = {
    elements: { namedItem: key => ({ value: values[key], checked: key === 'privacy_consent' }) },
    querySelector: s => s === '[type="submit"]' ? button : note,
    reportValidity: () => valid, addEventListener: (n, fn) => { handlers[n] = fn; }, setAttribute() {},
  };
  class FakeFormData { get(key) { return values[key]; } }
  vm.runInNewContext(source, {
    document: { getElementById: id => id === 'brief-form' ? form : result },
    window: { EE_FORM_CONFIG: { endpoint } }, FormData: FakeFormData,
    navigator: { clipboard: { writeText: async text => copies.push(text) } },
    fetch: fetchImpl || (async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: status >= 200 && status < 300, json: async () => response }; }),
    AbortSignal,
  });
  return { submit: () => handlers.submit?.({ preventDefault() {} }), result, button, requests, copies };
}

test('configured form sends JSON and waits for confirmed success', async () => {
  const app = mount();
  await app.submit();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].payload.privacy_consent, true);
  assert.equal(app.requests[0].payload.contact, '@test');
  assert.equal(app.copies.length, 0);
  assert.match(app.result.textContent, /Заявка отправлена/);
  assert.equal(app.button.disabled, false);
});

test('static GitHub Pages config keeps clipboard mode', async () => {
  const app = mount({ endpoint: '' });
  await app.submit();
  assert.equal(app.copies.length, 1);
  assert.equal(app.requests.length, 0);
  assert.match(app.result.textContent, /скопирована/);
});

test('honeypot and invalid form never call API', async () => {
  for (const options of [{ trap: 'spam' }, { valid: false }]) {
    const app = mount(options);
    await app.submit();
    assert.equal(app.requests.length, 0);
    assert.equal(app.copies.length, 0);
  }
});

test('delivery errors show failure and restore the submit button', async () => {
  for (const options of [{ status: 502, response: { error: 'Не удалось подтвердить отправку.' } }, { response: { ok: false } }, { fetchImpl: async () => { throw Error('offline'); } }]) {
    const app = mount(options);
    await app.submit();
    assert.doesNotMatch(app.result.textContent, /Заявка отправлена/);
    assert.match(app.result.textContent, /Не удалось/);
    assert.equal(app.button.disabled, false);
    assert.equal(app.button.innerHTML, 'Запланировать проект');
  }
});

test('safe Telegram diagnostic code reaches the form and leaves it available for retry', async () => {
  const app = mount({ status: 502, response: { code: 'TELEGRAM_CHAT_NOT_FOUND', error: 'Telegram не нашёл чат.' } });
  await app.submit();
  assert.match(app.result.textContent, /TELEGRAM_CHAT_NOT_FOUND/);
  assert.equal(app.button.disabled, false);
});

test('double submit is blocked until the first request finishes', async () => {
  let resolveResponse, calls = 0;
  const app = mount({ fetchImpl: () => { calls++; return new Promise(resolve => { resolveResponse = resolve; }); } });
  const first = app.submit();
  assert.equal(app.button.disabled, true);
  await app.submit();
  assert.equal(calls, 1);
  resolveResponse({ ok: true, json: async () => ({ ok: true }) });
  await first;
  assert.equal(app.button.disabled, false);
});

test('form and real backend agree on the full delivery contract', async () => {
  let message;
  const handler = createHandler({ token: '123:test-only', chatId: '456', fetchImpl: async (_url, init) => {
    message = JSON.parse(init.body);
    return Response.json({ ok: true, result: { message_id: 1 } });
  } });
  const app = mount({ fetchImpl: (url, init) => handler(new Request('http://localhost:3000' + url, init), '127.0.0.1') });
  await app.submit();
  assert.match(app.result.textContent, /Заявка отправлена/);
  assert.equal(message.chat_id, '456');
  assert.match(message.text, /Тест/);
  assert.match(message.text, /@test/);
});

