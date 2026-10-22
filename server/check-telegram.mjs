import { telegramCall, messages, TelegramError } from './telegram.mjs';
import { pathToFileURL } from 'node:url';

export async function checkTelegram({ token, chatId, sendTest = false, fetchImpl = fetch, log = console.log }) {
  token = String(token || '').trim();
  chatId = String(chatId || '').trim();
  if (!token || !chatId) throw new TelegramError('TELEGRAM_NOT_CONFIGURED');
  const call = (method, payload) => telegramCall({ token, method, payload, fetchImpl });
  const bot = await call('getMe');
  if (bot.is_bot !== true || !Number.isInteger(bot.id)) throw new TelegramError('TELEGRAM_INVALID_RESPONSE');
  log('OK: токен бота принят.');
  const chat = await call('getChat', { chat_id: chatId });
  if (!Number.isInteger(chat.id)) throw new TelegramError('TELEGRAM_INVALID_RESPONSE');
  if (chat.type === 'private' && chat.id === bot.id) {
    throw new TelegramError('TELEGRAM_CHAT_NOT_FOUND');
  }
  log('OK: настроенный чат доступен.');
  if (sendTest) {
    await call('sendMessage', { chat_id: chatId, text: 'Тест ee.: связь сайта с Telegram работает.', link_preview_options: { is_disabled: true } });
    log('OK: Telegram подтвердил отправку тестового сообщения. Проверьте выбранный чат.');
  } else log('Сообщения не отправлялись. Для теста доставки: npm run telegram:test');
}

// Keep imports side-effect free for tests.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await checkTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID, sendTest: process.argv.includes('--send-test') });
  } catch (error) {
    const code = error instanceof TelegramError ? error.code : 'TELEGRAM_NETWORK';
    console.error(code + ': ' + messages[code]);
    process.exitCode = 1;
  }
}
