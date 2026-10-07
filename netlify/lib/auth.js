// Shared helpers. Lives in a subfolder so Netlify does not deploy it as its own function.
const crypto = require('crypto');

const MAX_AGE = 86400; // 1 day, in seconds
const DEFAULT_SECRET = 'jdvp-attendance-default-secret-key-2026';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

function getSecret() {
  return process.env.AUTH_SECRET || DEFAULT_SECRET;
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

// Token = "<expiry>.<signature>". It can't be forged without AUTH_SECRET.
function createToken() {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return expires + '.' + sign(expires);
}

function isValidToken(token) {
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  if (Number(expires) < Date.now() / 1000) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(expires));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthenticated(event) {
  const cookie = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return isValidToken(match ? match[1] : null);
}

function authCookie(token) {
  return 'auth_token=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + MAX_AGE;
}

const clearedCookie =
  'auth_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

module.exports = { json, createToken, isAuthenticated, authCookie, clearedCookie };