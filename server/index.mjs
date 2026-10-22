import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHandler } from './handler.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`).split(',').map(s => s.trim()).filter(Boolean);
const handle = createHandler({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID, allowedOrigins });

const server = createServer(async (req, res) => {
  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(new URL(req.url, `http://localhost:${port}`), {
      method: req.method, headers: req.headers,
      ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
    const response = await handle(request, req.socket.remoteAddress);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ошибка обработки запроса.' }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, host, () => {
  console.log(`ee. local server: http://${host}:${port}`);
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) console.log('Telegram is not configured; submissions will return 503.');
});
