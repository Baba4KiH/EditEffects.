// Only fixed diagnostics leave this module; Telegram errors can contain secrets.
export const messages = {
  TELEGRAM_NOT_CONFIGURED: 'Заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env и перезапустите сервер.',
  TELEGRAM_TOKEN_INVALID: 'Telegram отклонил токен бота. Проверьте TELEGRAM_BOT_TOKEN и перезапустите сервер.',
  TELEGRAM_CHAT_NOT_FOUND: 'Telegram не нашёл чат. Нажмите Start у своего бота и проверьте TELEGRAM_CHAT_ID: для личного чата нужен числовой ID пользователя, а не имя бота или @username.',
  TELEGRAM_FORBIDDEN: 'Бот не может писать в этот чат. Разблокируйте его, нажмите Start; для группы или канала проверьте доступ и права бота.',
  TELEGRAM_RATE_LIMIT: 'Telegram ограничил частоту отправки. Подождите и попробуйте позже.',
  TELEGRAM_CHAT_MIGRATED: 'Группа преобразована в супергруппу. Обновите TELEGRAM_CHAT_ID на её новый числовой ID и перезапустите сервер.',
  TELEGRAM_NETWORK: 'Не удалось соединиться с Telegram. Проверьте доступ компьютера к api.telegram.org, DNS, VPN и сетевые ограничения. Доставка не подтверждена; при повторе возможен дубль.',
  TELEGRAM_TIMEOUT: 'Telegram не ответил вовремя. Доставка не подтверждена; проверьте чат перед повторной отправкой, чтобы избежать дубля.',
  TELEGRAM_REJECTED: 'Telegram отклонил запрос. Запустите npm run telegram:check на компьютере с сервером.',
  TELEGRAM_INVALID_RESPONSE: 'Получен некорректный ответ Telegram. Доставка не подтверждена; проверьте чат перед повтором.',
};

export class TelegramError extends Error {
  constructor(code) { super(messages[code]); this.code = code; }
}

export async function telegramCall({ token, method, payload = {}, fetchImpl = fetch }) {
  token = String(token || '').trim();
  if (!token) throw new TelegramError('TELEGRAM_NOT_CONFIGURED');
  let response, data;
  try {
    response = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    try { data = await response.json(); }
    catch { throw new TelegramError('TELEGRAM_INVALID_RESPONSE'); }
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    throw new TelegramError(['TimeoutError', 'AbortError'].includes(error?.name) ? 'TELEGRAM_TIMEOUT' : 'TELEGRAM_NETWORK');
  }
  if (!response.ok || data?.ok !== true) {
    const status = data?.error_code || response.status;
    // Never forward description, URLs, raw errors or migration IDs to the client.
    const description = typeof data?.description === 'string' ? data.description : '';
    const code = status === 401 || status === 404 ? 'TELEGRAM_TOKEN_INVALID'
      : status === 403 ? 'TELEGRAM_FORBIDDEN'
      : status === 429 ? 'TELEGRAM_RATE_LIMIT'
      : data?.parameters?.migrate_to_chat_id ? 'TELEGRAM_CHAT_MIGRATED'
      : status === 400 && /chat not found/i.test(description) ? 'TELEGRAM_CHAT_NOT_FOUND'
      : 'TELEGRAM_REJECTED';
    throw new TelegramError(code);
  }
  if (!data.result || (method === 'sendMessage' && !Number.isInteger(data.result.message_id))) {
    throw new TelegramError('TELEGRAM_INVALID_RESPONSE');
  }
  return data.result;
}
