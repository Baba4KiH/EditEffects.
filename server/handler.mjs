import { readFile } from 'node:fs/promises';

const publicFiles = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
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

export function createHandler({ token, chatId, allowedOrigins = [], fetchImpl = fetch, now = Date.now } = {}) {
  const attempts = new Map();
  return async function handle(request, ip = 'unknown') {
    const pathname = new URL(request.url).pathname;
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    const json = (status, data) => Response.json(data, { status, headers });
    if (pathname !== '/api/brief') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'Метод не поддерживается.' });
      if (pathname === '/form-config.js') {
        return new Response(request.method === 'HEAD' ? null : 'window.EE_FORM_CONFIG = { endpoint: "/api/brief" };', {
          headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' },
        });
      }
      const file = publicFiles.get(pathname);
      if (!file) return json(404, { error: 'Страница не найдена.' });
      try {
        const body = await readFile(new URL('../' + file[0], import.meta.url));
        return new Response(request.method === 'HEAD' ? null : body, { headers: { ...headers, 'content-type': file[1] + '; charset=utf-8' } });
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
    if (!token || !chatId) return json(503, { error: 'Отправка пока не настроена.' });
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
      const response = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(10000),
      });
      const telegram = await response.json();
      if (!response.ok || telegram.ok !== true || !Number.isInteger(telegram.result?.message_id)) throw Error('Telegram rejected request');
      return json(200, { ok: true });
    } catch {
      // Never return/log Telegram URLs or errors: they may contain the bot token.
      return json(502, { error: 'Не удалось подтвердить отправку. Попробуйте позже.' });
    }
  };
}
