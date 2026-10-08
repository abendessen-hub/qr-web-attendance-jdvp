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

function createToken() {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return expires + '.' + sign(expires);
}

function isValidToken(token) {
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(expires));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isAuthenticated(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return isValidToken(match ? match[1] : null);
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

module.exports = { json, createToken, isAuthenticated, authCookie, clearedCookie, parseJsonBody };