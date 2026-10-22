import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createHandler } from './handler.mjs';
import { readConfig, clientIP } from './config.mjs';

const config = readConfig();
if (config.production) {
  for (const file of ['privacy.html', 'consent.html']) {
    if (/Документ подготавливается/.test(await readFile(new URL('../' + file, import.meta.url), 'utf8'))) {
      throw Error('Complete privacy.html and consent.html before production. See PUBLICATION.txt.');
    }
  }
}
const handle = createHandler({ ...config, token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID,
  log: code => console.error(JSON.stringify({ time: new Date().toISOString(), event: 'delivery_error', code })) });
const server = createServer(async (req, res) => {
  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(new URL(req.url, `http://localhost:${config.port}`), {
      method: req.method, headers: req.headers,
      ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
    const response = await handle(request, clientIP(request, req.socket.remoteAddress, config.trustedProxies));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    console.error(JSON.stringify({ time: new Date().toISOString(), event: 'request_error' }));
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'Сервис временно недоступен. Попробуйте позже.' }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(config.port, config.host, () => console.log(`ee. server: http://${config.host}:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 15000).unref();
});
