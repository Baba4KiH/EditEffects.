import { isIP } from 'node:net';

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be between 1 and 65535.');
  let siteUrl = '';
  if (env.SITE_URL?.trim()) {
    const url = new URL(env.SITE_URL.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('SITE_URL must be an HTTP(S) origin without a path.');
    siteUrl = url.origin;
  }
  if (production && (!siteUrl.startsWith('https://') || env.LEGAL_READY !== 'true' || !env.TELEGRAM_BOT_TOKEN?.trim() || !env.TELEGRAM_CHAT_ID?.trim())) {
    throw Error('Production requires HTTPS SITE_URL, completed documents with LEGAL_READY=true, and Telegram credentials. See PUBLICATION.txt.');
  }
  const trustedProxies = (env.TRUSTED_PROXY_IPS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (trustedProxies.some(x => !isIP(x))) throw Error('TRUSTED_PROXY_IPS accepts exact IP addresses only.');
  const allowedOrigins = [siteUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`].filter(Boolean);
  return { production, port, host: env.HOST || '127.0.0.1', siteUrl: siteUrl || `http://localhost:${port}`, trustedProxies,
    allowedOrigins: production ? [siteUrl] : allowedOrigins,
    indexing: production && env.ALLOW_INDEXING === 'true',
    googleVerification: env.GOOGLE_SITE_VERIFICATION || '', yandexVerification: env.YANDEX_VERIFICATION || '' };
}

export function clientIP(request, remoteAddress, trustedProxies = []) {
  // Only a specifically trusted proxy may supply this header, and it must overwrite it.
  const value = request.headers.get('x-real-ip')?.trim();
  return trustedProxies.includes(remoteAddress) && isIP(value || '') ? value : remoteAddress;
}
