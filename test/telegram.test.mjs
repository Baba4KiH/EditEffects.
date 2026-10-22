import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramCall } from '../server/telegram.mjs';
import { checkTelegram } from '../server/check-telegram.mjs';
import { createHandler } from '../server/handler.mjs';

test('known Telegram failures are actionable and never expose raw descriptions or token', async () => {
  for (const [status, description, parameters, expected] of [
    [401, 'secret-token', undefined, 'TELEGRAM_TOKEN_INVALID'],
    [404, 'secret-token', undefined, 'TELEGRAM_TOKEN_INVALID'],
    [400, 'Bad Request: chat not found secret-token', undefined, 'TELEGRAM_CHAT_NOT_FOUND'],
    [403, 'secret-token', undefined, 'TELEGRAM_FORBIDDEN'],
    [429, 'secret-token', undefined, 'TELEGRAM_RATE_LIMIT'],
    [400, 'secret-token', { migrate_to_chat_id: -100123 }, 'TELEGRAM_CHAT_MIGRATED'],
    [500, 'secret-token', undefined, 'TELEGRAM_REJECTED'],
  ]) {
    const fetchImpl = async () => Response.json({ ok: false, error_code: status, description, parameters }, { status });
    const handler = createHandler({ token: 'secret-token', chatId: '456', fetchImpl });
    const response = await handler(new Request('http://localhost/api/brief', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact: '@test', task: 'Test', privacy_consent: true }),
    }));
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.code, expected);
    assert.ok(body.error.length > 20);
    assert.doesNotMatch(JSON.stringify(body), /secret-token|-100123/);
  }
});

test('network, timeout and broken responses have distinct safe codes', async () => {
  for (const [fetchImpl, code] of [
    [async () => { throw Error('secret-token'); }, 'TELEGRAM_NETWORK'],
    [async () => { throw new DOMException('secret-token', 'TimeoutError'); }, 'TELEGRAM_TIMEOUT'],
    [async () => new Response('secret-token'), 'TELEGRAM_INVALID_RESPONSE'],
    [async () => Response.json({ ok: true, result: {} }), 'TELEGRAM_INVALID_RESPONSE'],
  ]) {
    await assert.rejects(telegramCall({ token: 'secret-token', method: 'sendMessage', fetchImpl }), error => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    });
  }
});

test('check verifies bot and configured recipient without sending messages by default', async () => {
  const calls = [], logs = [];
  await checkTelegram({ token: ' 123:test ', chatId: ' 456 ', log: line => logs.push(line), fetchImpl: async (url, init) => {
    calls.push({ method: url.split('/').at(-1), payload: JSON.parse(init.body) });
    assert.ok(url.startsWith('https://api.telegram.org/bot123:test/'));
    return Response.json({ ok: true, result: calls.length === 1 ? { id: 123, is_bot: true } : { id: 456, type: 'private' } });
  } });
  assert.deepEqual(calls, [{ method: 'getMe', payload: {} }, { method: 'getChat', payload: { chat_id: '456' } }]);
  assert.doesNotMatch(logs.join('\n'), /123:test|456/);
});

test('explicit delivery test uses only configured recipient and requires message confirmation', async () => {
  const calls = [], logs = [];
  const fetchImpl = async (url, init) => {
    const method = url.split('/').at(-1);
    calls.push({ method, payload: JSON.parse(init.body) });
    return Response.json({ ok: true, result: method === 'getMe' ? { id: 123, is_bot: true } : method === 'getChat' ? { id: 456, type: 'private' } : { message_id: 7 } });
  };
  await checkTelegram({ token: '123:test', chatId: '456', sendTest: true, fetchImpl, log: line => logs.push(line) });
  assert.equal(calls[2].method, 'sendMessage');
  assert.equal(calls[2].payload.chat_id, '456');
  assert.match(logs.at(-1), /подтвердил отправку/);
});

test('checks stop on invalid credentials, unavailable chat or missing settings', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ ok: false, error_code: 401 }, { status: 401 }); };
  await assert.rejects(checkTelegram({ token: '123:test', chatId: '456', sendTest: true, fetchImpl }), { code: 'TELEGRAM_TOKEN_INVALID' });
  assert.equal(calls, 1);
  await assert.rejects(checkTelegram({ token: '', chatId: '456', fetchImpl }), { code: 'TELEGRAM_NOT_CONFIGURED' });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(checkTelegram({ token: '123:test', chatId: '456', sendTest: true, log() {}, fetchImpl: async () => {
    calls++;
    return calls === 1 ? Response.json({ ok: true, result: { id: 123, is_bot: true } }) : Response.json({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, { status: 400 });
  } }), { code: 'TELEGRAM_CHAT_NOT_FOUND' });
  assert.equal(calls, 2);
});

test('delivery test never reports success when Telegram did not confirm sending', async () => {
  const logs = [];
  await assert.rejects(checkTelegram({ token: '123:test', chatId: '456', sendTest: true, log: line => logs.push(line), fetchImpl: async url => {
    const method = url.split('/').at(-1);
    return Response.json({ ok: true, result: method === 'getMe' ? { id: 123, is_bot: true } : method === 'getChat' ? { id: 456, type: 'private' } : {} });
  } }), { code: 'TELEGRAM_INVALID_RESPONSE' });
  assert.doesNotMatch(logs.join('\n'), /подтвердил отправку/);
});
