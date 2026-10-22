import { readFile } from 'node:fs/promises';
import { telegramCall, TelegramError } from './telegram.mjs';

const publicFiles = new Map([
  ['/fonts/manrope.woff2', ['fonts/manrope.woff2', 'font/woff2']],
  ['/site-1.js', ['site-1.js', 'text/javascript']],
  ['/site-2.js', ['site-2.js', 'text/javascript']],
  ['/og-image.png', ['og-image.png', 'image/png']],
  ['/sitemap.xml', ['sitemap.xml', 'application/xml']],
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']], ['/favicon.ico', ['favicon.ico', 'image/x-icon']],
  ['/styles.css', ['styles.css', 'text/css']], ['/form.js', ['form.js', 'text/javascript']],
  ['/consent.html', ['consent.html', 'text/html']], ['/privacy.html', ['privacy.html', 'text/html']],
]);

async function readJson(request) {
  if (Number(request.headers.get('content-length')) > 16384) throw 413;
  const reader = request.body?.getReader();
  if (!reader) throw 400;
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw 413; }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { throw error === 413 ? 413 : 400; }
}

export function createHandler({ token, chatId, allowedOrigins = [], fetchImpl = fetch, now = Date.now, siteUrl = '', indexing = false, production = false, googleVerification = '', yandexVerification = '', log = () => {} } = {}) {
  token = String(token || '').trim();
  chatId = String(chatId || '').trim();
  const attempts = new Map();
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const render = text => text.replaceAll('{{SITE_URL}}', siteUrl || 'http://localhost:3000')
    .replaceAll('{{ROBOTS}}', indexing ? 'index, follow, max-image-preview:large' : 'noindex, nofollow')
    .replace('</head>', (googleVerification ? '<meta name="google-site-verification" content="' + escape(googleVerification) + '">' : '') +
      (yandexVerification ? '<meta name="yandex-verification" content="' + escape(yandexVerification) + '">' : '') + '</head>');
  return async function handle(request, ip = 'unknown') {
    const pathname = new URL(request.url).pathname;
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
    if (!indexing) headers['x-robots-tag'] = 'noindex, nofollow';
    const json = (status, data) => Response.json(data, { status, headers });
    if (pathname !== '/api/brief') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'Метод не поддерживается.' });
      if (pathname === '/healthz') return json(200, { ok: true });
      if (pathname === '/robots.txt') return new Response(request.method === 'HEAD' ? null :
        (indexing ? 'User-agent: *\nAllow: /\nSitemap: ' + siteUrl + '/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n'),
        { headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
      if (pathname === '/form-config.js') {
        return new Response(request.method === 'HEAD' ? null : 'window.EE_FORM_CONFIG = { endpoint: "/api/brief" };', {
          headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' },
        });
      }
      const file = publicFiles.get(pathname);
      if (!file) return new Response(request.method === 'HEAD' ? null : await readFile(new URL('../404.html', import.meta.url)), {
        status: 404, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
      try {
        let body = await readFile(new URL('../' + file[0], import.meta.url));
        const dynamic = file[1] === 'text/html' || file[1] === 'application/xml';
        if (dynamic) {
          body = render(body.toString('utf8'));
          if (!production && pathname !== '/sitemap.xml') body = body.replace('<main', '<p class="test-banner" role="status">Тестовая версия: используйте только вымышленные данные.</p><main');
        } else headers['cache-control'] = 'public, max-age=3600';
        return new Response(request.method === 'HEAD' ? null : body, { headers: { ...headers, 'content-type': file[1] + (/^(text\/|application\/xml)/.test(file[1]) ? '; charset=utf-8' : '') } });
      } catch { return json(404, { error: 'Страница не найдена.' }); }
    }
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) return json(403, { error: 'Источник запроса не разрешён.' });
    if (origin) { headers['access-control-allow-origin'] = origin; headers.vary = 'Origin'; }
    if (request.method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'POST, OPTIONS';
      headers['access-control-allow-headers'] = 'Content-Type';
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return json(405, { error: 'Используйте POST.' });
    if (!token || !chatId) return json(503, { code: 'TELEGRAM_NOT_CONFIGURED', error: 'Форма временно недоступна. Напишите нам в Telegram @baba4kih.' });
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json(415, { error: 'Нужен формат JSON.' });
    const time = now();
    for (const [key, value] of attempts) if (value.expires <= time) attempts.delete(key);
    const entry = attempts.get(ip) || { count: 0, expires: time + 60000 };
    if (entry.count >= 5 || (!attempts.has(ip) && attempts.size >= 10000)) {
      headers['retry-after'] = '60';
      return json(429, { error: 'Слишком много заявок. Попробуйте через минуту.' });
    }
    entry.count++;
    attempts.set(ip, entry);
    let data;
    try { data = await readJson(request); }
    catch (status) { return json(status, { error: status === 413 ? 'Заявка слишком большая.' : 'Некорректный запрос.' }); }
    const limits = { name: 100, contact: 160, task: 2000, website: 500 };
    if (!data || Array.isArray(data) || typeof data !== 'object' || Object.entries(limits).some(([key, limit]) =>
      (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > limit)))) {
      return json(400, { error: 'Проверьте поля заявки.' });
    }
    if ((data.website || '').trim()) return json(400, { error: 'Заявка отклонена.' });
    if (!data.contact?.trim() || !data.task?.trim() || data.privacy_consent !== true) {
      return json(400, { error: 'Укажите контакт, описание проекта и согласие на обработку данных.' });
    }
    const text = ['Новая заявка — ee.', '', 'Имя: ' + (data.name?.trim() || 'Не указано'),
      'Контакт: ' + data.contact.trim(), 'Проект: ' + data.task.trim(), '',
      'Согласие: подтверждено (галочка формы)', 'Получено: ' + new Date(time).toISOString()].join('\n');
    try {
      await telegramCall({ token, method: 'sendMessage', fetchImpl, payload: {
        chat_id: chatId, text, link_preview_options: { is_disabled: true },
      } });
      return json(200, { ok: true });
    } catch (error) {
      // Fixed, safe messages only, never Telegram's raw response or URL.
      if (error instanceof TelegramError) { log(error.code); return json(502, { code: error.code, error: 'Не удалось подтвердить отправку. Попробуйте позже или напишите нам в Telegram @baba4kih.' }); }
      return json(502, { error: 'Не удалось подтвердить отправку. Попробуйте позже.' });
    }
  };
}

