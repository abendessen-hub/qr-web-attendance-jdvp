const crypto = require('node:crypto');

const MAX_AGE = 86400;

function json(res, statusCode, body, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(extraHeaders)) {
    res.setHeader(name, value);
  }
  res.end(JSON.stringify(body));
}

function getSecret() {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET is not configured');
  }
  return process.env.AUTH_SECRET;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function createToken(session = {}) {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  const payload = Buffer.from(JSON.stringify({
    qualification: session.qualification || null,
    admin: session.admin === true
  })).toString('base64url');
  const value = expires + '.' + payload;
  return value + '.' + sign(value);
}

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [expires, payload, signature] = parts;
  if (!expires || !payload || !signature || !Number.isFinite(Number(expires)) ||
      Number(expires) < Date.now() / 1000) return null;
  const value = expires + '.' + payload;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(value));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (session.admin === true && session.qualification === null) return session;
    if (/^[1-6]$/.test(session.qualification)) return { qualification: session.qualification, admin: false };
  } catch (_) {
    return null;
  }
  return null;
}

function isAuthenticated(req) {
  return getSession(req) !== null;
}

function authCookie(token) {
  return 'auth_token=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + MAX_AGE;
}

const clearedCookie =
  'auth_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

function parseJsonBody(req) {
  if (req.body === undefined || req.body === null || req.body === '') return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  return JSON.parse(body);
}

module.exports = { json, createToken, getSession, isAuthenticated, authCookie, clearedCookie, parseJsonBody };