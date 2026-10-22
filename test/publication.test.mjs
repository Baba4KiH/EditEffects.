import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/handler.mjs';
import { readConfig, clientIP } from '../server/config.mjs';

const get = (handler, path, options) => handler(new Request('https://studio.example' + path, options));
test('production fails closed without domain, credentials and legal confirmation', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }));
  const env = { NODE_ENV: 'production', SITE_URL: 'https://studio.example', LEGAL_READY: 'true', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_ID: '123' };
  assert.equal(readConfig(env).indexing, false);
  assert.equal(readConfig({ ...env, ALLOW_INDEXING: 'true' }).indexing, true);
  for (const SITE_URL of ['https://studio.example/path', 'https://user:pass@studio.example', 'http://studio.example', 'javascript:alert(1)']) {
    assert.throws(() => readConfig({ ...env, SITE_URL }));
  }
});
test('client cannot spoof IP unless request arrives from the configured proxy', () => {
  const request = new Request('http://localhost', { headers: { 'x-real-ip': '192.0.2.10', 'x-forwarded-for': '192.0.2.20' } });
  assert.equal(clientIP(request, '198.51.100.2', ['127.0.0.1']), '198.51.100.2');
  assert.equal(clientIP(request, '127.0.0.1', ['127.0.0.1']), '192.0.2.10');
  assert.equal(clientIP(new Request('http://localhost', { headers: { 'x-real-ip': 'bad, value' } }), '127.0.0.1', ['127.0.0.1']), '127.0.0.1');
});
test('SEO uses configured origin, verification is escaped and previews are not indexed', async () => {
  const handler = createHandler({ siteUrl: 'https://studio.example', googleVerification: '"><script>bad</script>' });
  const res = await get(handler, '/');
  const html = await res.text();
  assert.match(html, /href="https:\/\/studio.example\/"/);
  assert.doesNotMatch(html, /github|\{\{SITE_URL\}\}|\{\{ROBOTS\}\}|<script>bad/);
  assert.match(html, /content="noindex, nofollow"/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(await (await get(handler, '/robots.txt')).text(), /Disallow: \//);
  const live = createHandler({ siteUrl: 'https://studio.example', indexing: true, production: true });
  assert.match(await (await get(live, '/robots.txt')).text(), /Sitemap: https:\/\/studio.example\/sitemap.xml/);
  const liveHtml = await (await get(live, '/')).text();
  assert.match(liveHtml, /index, follow, max-image-preview:large/);
  assert.doesNotMatch(liveHtml, /Тестовая версия/);
  assert.match(await (await get(live, '/sitemap.xml')).text(), /<loc>https:\/\/studio.example\/<\/loc>/);
});
test('assets, HEAD, health, 404 and private files behave correctly', async () => {
  const handler = createHandler();
  for (const path of ['/fonts/manrope.woff2', '/site-1.js', '/site-2.js', '/styles.css']) {
    const res = await get(handler, path);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  }
  for (const path of ['/missing', '/.env', '/server/config.mjs', '/PUBLICATION.txt', '/deploy/ee.service']) {
    const res = await get(handler, path);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /Страница не найдена/);
    assert.equal(await (await get(handler, path, { method: 'HEAD' })).text(), '');
  }
  assert.deepEqual(await (await get(handler, '/healthz')).json(), { ok: true });
});
test('different trusted client IPs do not share the request budget', async () => {
  const handler = createHandler({ token: 'test', chatId: '123', fetchImpl: async () => Response.json({ ok: true, result: { message_id: 1 } }) });
  const request = ip => new Request('http://localhost/api/brief', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ contact: 'test', task: 'test', privacy_consent: true }) });
  for (let i = 0; i < 5; i++) { const r = request('192.0.2.1'); assert.equal((await handler(r, clientIP(r, '127.0.0.1', ['127.0.0.1']))).status, 200); }
  const blocked = request('192.0.2.1');
  assert.equal((await handler(blocked, clientIP(blocked, '127.0.0.1', ['127.0.0.1']))).status, 429);
  const other = request('192.0.2.2');
  assert.equal((await handler(other, clientIP(other, '127.0.0.1', ['127.0.0.1']))).status, 200);
});
