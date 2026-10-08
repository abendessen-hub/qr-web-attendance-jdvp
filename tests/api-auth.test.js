const assert = require('node:assert/strict');
const test = require('node:test');

const login = require('../api/login');
const checkAuth = require('../api/check-auth');
const getConfig = require('../api/get-config');
const proxy = require('../api/api');

async function invoke(handler, request) {
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    }
  };
  await handler(request, response);
  return response;
}

test('login cookie authenticates protected Vercel endpoints', async () => {
  const previous = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    ACCOUNTS: process.env.ACCOUNTS,
    API_URL: process.env.API_URL
  };
  process.env.AUTH_SECRET = 'test-secret-for-api-auth';
  process.env.ACCOUNTS = 'operator:strong-password';
  process.env.API_URL = 'https://example.test/exec';

  try {
    const loginResponse = await invoke(login, {
      method: 'POST',
      headers: {},
      body: { username: 'operator', password: 'strong-password' }
    });
    assert.equal(loginResponse.statusCode, 200);
    const cookie = loginResponse.headers['Set-Cookie'].split(';')[0];

    const authResponse = await invoke(checkAuth, { method: 'GET', headers: { cookie } });
    assert.equal(authResponse.statusCode, 200);
    assert.deepEqual(JSON.parse(authResponse.body), { authenticated: true });

    const configResponse = await invoke(getConfig, { method: 'GET', headers: { cookie } });
    assert.equal(configResponse.statusCode, 200);
    assert.equal(JSON.parse(configResponse.body).API_URL, process.env.API_URL);

    const deniedResponse = await invoke(proxy, { method: 'GET', url: '/api/api?action=registry', headers: {} });
    assert.equal(deniedResponse.statusCode, 401);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});