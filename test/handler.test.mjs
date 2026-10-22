import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/handler.mjs';

const valid = { name: 'Алексей', contact: '@alexey', task: 'Монтаж ролика', privacy_consent: true, website: '' };
function setup(options = {}) {
  const sent = [];
  const handler = createHandler({
    token: '123:test-only', chatId: '456', allowedOrigins: ['https://baba4kih.github.io'],
    fetchImpl: async (url, init) => { sent.push({ url, payload: JSON.parse(init.body) }); return Response.json({ ok: true, result: { message_id: 1 } }); },
    ...options,
  });
  const request = (body = valid, headers = {}, ip = '127.0.0.1') => handler(new Request('http://localhost:3000/api/brief', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://baba4kih.github.io', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }), ip);
  return { handler, request, sent };
}

test('valid brief is delivered to configured Telegram chat as plain text', async () => {
  const { request, sent } = setup();
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.telegram.org/bot123:test-only/sendMessage');
  assert.equal(sent[0].payload.chat_id, '456');
  assert.ok(sent[0].payload.text.includes('Алексей'));
  assert.ok(sent[0].payload.text.includes('@alexey'));
  assert.ok(sent[0].payload.text.includes('Монтаж ролика'));
  assert.ok(sent[0].payload.text.includes('Согласие: подтверждено'));
  assert.equal(sent[0].payload.parse_mode, undefined);
});

test('filled honeypot is rejected before contacting Telegram', async () => {
  const { request, sent } = setup();
  assert.equal((await request({ ...valid, website: 'https://spam.example' })).status, 400);
  assert.equal(sent.length, 0);
});

test('missing consent, wrong types, blank and overlong fields are rejected', async () => {
  for (const change of [{ privacy_consent: false }, { privacy_consent: 'true' }, { contact: ' ' }, { task: '' }, { name: {} }, { task: 'x'.repeat(2001) }, { contact: 'x'.repeat(161) }, { website: {} }]) {
    const { request, sent } = setup();
    assert.equal((await request({ ...valid, ...change })).status, 400, JSON.stringify(change));
    assert.equal(sent.length, 0);
  }
});

test('malformed and oversized request bodies do not reach Telegram', async () => {
  const { request, sent } = setup();
  assert.equal((await request('{broken')).status, 400);
  assert.equal((await request('x'.repeat(17000))).status, 413);
  assert.equal(sent.length, 0);
});

test('foreign origin is blocked and allowed origin receives CORS headers', async () => {
  const { request, sent } = setup();
  assert.equal((await request(valid, { origin: 'https://other.example' })).status, 403);
  const allowed = await request();
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://baba4kih.github.io');
  assert.equal(sent.length, 1);
});

test('preflight allows only configured origin and POST', async () => {
  const { handler, sent } = setup();
  const response = await handler(new Request('http://localhost:3000/api/brief', { method: 'OPTIONS', headers: { origin: 'https://baba4kih.github.io', 'access-control-request-method': 'POST' } }), '127.0.0.1');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(sent.length, 0);
});

test('Telegram rejection, invalid response and network error return no false success or secret', async () => {
  for (const fetchImpl of [async () => Response.json({ ok: false, description: 'token 123:test-only' }), async () => new Response('bad'), async () => { throw Error('https://api.telegram.org/bot123:test-only/sendMessage'); }]) {
    const { request } = setup({ fetchImpl });
    const response = await request();
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('123:test-only'));
  }
});

test('unconfigured Telegram returns 503', async () => {
  const { request, sent } = setup({ token: '' });
  assert.equal((await request()).status, 503);
  assert.equal(sent.length, 0);
});

test('rate limit blocks bursts and expires', async () => {
  let time = 1000;
  const { request, sent } = setup({ now: () => time });
  for (let i = 0; i < 5; i++) assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
  time += 60001;
  assert.equal((await request()).status, 200);
  assert.equal(sent.length, 6);
});

test('server only serves public assets, never secrets or source code', async () => {
  const { handler } = setup();
  for (const path of ['/.env', '/server/index.mjs', '/README.md', '/package.json', '/%2e%2e/.env']) {
    assert.equal((await handler(new Request('http://localhost:3000' + path))).status, 404);
  }
  const page = await handler(new Request('http://localhost:3000/'));
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('brief-form'));
  const config = await handler(new Request('http://localhost:3000/form-config.js'));
  assert.ok((await config.text()).includes('/api/brief'));
});

