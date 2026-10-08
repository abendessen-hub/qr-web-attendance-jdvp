const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const login = require('../api/login');
const checkAuth = require('../api/check-auth');
const getConfig = require('../api/get-config');
const proxy = require('../api/api');
const { createToken, authCookie } = require('../api-lib/auth');
const scriptModule = { exports: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8') +
    '\nmodule.exports = { isWithinTimeInWindow, isTimeOutAllowed };',
  { module: scriptModule }
);
const { isWithinTimeInWindow, isTimeOutAllowed } = scriptModule.exports;

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
    assert.deepEqual(JSON.parse(authResponse.body), {
      authenticated: true,
      qualification: '1',
      admin: false
    });

    const configResponse = await invoke(getConfig, { method: 'GET', headers: { cookie } });
    assert.equal(configResponse.statusCode, 200);
    assert.equal(JSON.parse(configResponse.body).API_URL, '/api/api');
    assert.equal(JSON.parse(configResponse.body).qualification, '1');

    const deniedResponse = await invoke(proxy, { method: 'GET', url: '/api/api?action=registry', headers: {} });
    assert.equal(deniedResponse.statusCode, 401);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('qualification accounts cannot read or register for another qualification', async () => {
  const previous = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    ACCOUNTS: process.env.ACCOUNTS,
    API_URL: process.env.API_URL
  };
  process.env.AUTH_SECRET = 'test-secret-for-qualification-scope';
  process.env.ACCOUNTS = 'first:password:1,second:password:2,admin:password:all';

  let upstreamUrl = '';
  let upstreamBody = '';
  let upstreamMethod = '';
  const upstream = http.createServer((req, res) => {
    upstreamUrl = req.url;
    upstreamMethod = req.method;
    upstreamBody = '';
    req.on('data', (chunk) => { upstreamBody += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        records: [
          { qualification: 'Cookery', id: '10001' },
          {
            qualification: 'House Keeping',
            id: '20001',
            date: new Date().toISOString().slice(0, 10),
            timeIn: '07:00 AM',
            timeOut: ''
          }
        ],
        trainees: [
          { qualification: 'Cookery', id: '10001' },
          { qualification: 'House Keeping', id: '20001' }
        ]
      }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  process.env.API_URL = `http://127.0.0.1:${upstream.address().port}/exec`;

  try {
    const loginResponse = await invoke(login, {
      method: 'POST',
      headers: {},
      body: { username: 'second', password: 'password' }
    });
    const cookie = loginResponse.headers['Set-Cookie'].split(';')[0];

    const forbiddenRegistration = await invoke(proxy, {
      method: 'POST',
      headers: { cookie },
      body: { action: 'register', qualification: '1', id: '10001', name: 'Wrong sheet' }
    });
    assert.equal(forbiddenRegistration.statusCode, 403);

    const forbiddenScan = await invoke(proxy, {
      method: 'POST',
      headers: { cookie },
      body: { action: 'scan', id: '10001' }
    });
    assert.equal(forbiddenScan.statusCode, 403);
    assert.equal(upstreamBody, '');

    const mappedScan = await invoke(proxy, {
      method: 'POST',
      headers: { cookie },
      body: { action: 'scan', id: '0001', allowAnyTime: true }
    });
    assert.equal(mappedScan.statusCode, 200);
    assert.deepEqual(JSON.parse(upstreamBody), {
      action: 'scan',
      id: '20001',
      qualification: '2',
      restrictedTimeWindow: true
    });

    const allowedRegistration = await invoke(proxy, {
      method: 'POST',
      headers: { cookie },
      body: { action: 'register', qualification: '2', id: '20002', name: 'Allowed trainee' }
    });
    assert.equal(allowedRegistration.statusCode, 200);
    assert.deepEqual(JSON.parse(upstreamBody), {
      action: 'register',
      qualification: '2',
      id: '20002',
      name: 'Allowed trainee'
    });

    const forbiddenRead = await invoke(proxy, {
      method: 'GET',
      url: '/api/api?qualification=1',
      headers: { cookie }
    });
    assert.equal(forbiddenRead.statusCode, 403);

    const adminLogin = await invoke(login, {
      method: 'POST',
      headers: {},
      body: { username: 'admin', password: 'password' }
    });
    const adminCookie = adminLogin.headers['Set-Cookie'].split(';')[0];
    const adminAuth = await invoke(checkAuth, {
      method: 'GET',
      headers: { cookie: adminCookie }
    });
    assert.deepEqual(JSON.parse(adminAuth.body), {
      authenticated: true,
      qualification: null,
      admin: true
    });
    const adminScan = await invoke(proxy, {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: { action: 'scan', id: '10001' }
    });
    assert.equal(adminScan.statusCode, 200);
    assert.equal(upstreamMethod, 'POST');
    assert.deepEqual(JSON.parse(upstreamBody), {
      action: 'scan',
      id: '10001',
      allowAnyTime: true
    });

    const getResponse = await invoke(proxy, {
      method: 'GET',
      url: '/api/api?action=registry',
      headers: { cookie }
    });
    assert.equal(getResponse.statusCode, 200);
    assert.match(upstreamUrl, /qualification=2/);
    assert.deepEqual(JSON.parse(getResponse.body).records, [
      {
        qualification: 'House Keeping',
        id: '20001',
        date: new Date().toISOString().slice(0, 10),
        timeIn: '07:00 AM',
        timeOut: ''
      }
    ]);
    assert.deepEqual(JSON.parse(getResponse.body).trainees, [
      { qualification: 'House Keeping', id: '20001' }
    ]);
  } finally {
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('Apps Script enforces limited time windows and allows admin time-outs', () => {
  assert.equal(isWithinTimeInWindow(6), false);
  assert.equal(isWithinTimeInWindow(7), true);
  assert.equal(isWithinTimeInWindow(14), true);
  assert.equal(isWithinTimeInWindow(15), false);

  assert.equal(isTimeOutAllowed(14, false), false);
  assert.equal(isTimeOutAllowed(15, false), true);
  assert.equal(isTimeOutAllowed(21, false), true);
  assert.equal(isTimeOutAllowed(22, false), false);
  assert.equal(isTimeOutAllowed(23, false), false);
  assert.equal(isTimeOutAllowed(22, true), true);
  assert.equal(isTimeOutAllowed(0, true), true);
});

test('proxy reports an HTML upstream response as a configuration error', async () => {
  const previous = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    API_URL: process.env.API_URL
  };
  process.env.AUTH_SECRET = 'test-secret-for-html-upstream';

  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!DOCTYPE html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  process.env.API_URL = `http://127.0.0.1:${upstream.address().port}/exec`;

  try {
    const response = await invoke(proxy, {
      method: 'POST',
      headers: { cookie: authCookie(createToken({ qualification: '1' })) },
      body: { action: 'getNextId', qualification: '1' }
    });
    assert.equal(response.statusCode, 502);
    assert.match(JSON.parse(response.body).message, /returned HTML instead of JSON/);
  } finally {
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});