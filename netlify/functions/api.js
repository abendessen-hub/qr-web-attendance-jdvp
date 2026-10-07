const https = require('https');
const http = require('http');
const { json, isAuthenticated } = require('../lib/auth');

const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwrFhdqB2zuFnvCYKnxCyBPVVE9nfWog1yVVF__9pfi1pqueKfFhBLrOlVQmJa9fgNWXQ/exec';

function requestWithRedirects(targetUrl, method, postBody, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error('Too many redirects'));
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      method: method,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      }
    };

    const req = client.request(targetUrl, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return requestWithRedirects(res.headers.location, 'GET', null, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    if (postBody && method === 'POST') {
      req.write(typeof postBody === 'string' ? postBody : JSON.stringify(postBody));
    }
    req.end();
  });
}

// Input sanitizer: strips script tags and HTML characters to prevent XSS and injection
function sanitizeString(str, maxLen = 80) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>'"/\\;`]/g, '').trim().slice(0, maxLen);
}

exports.handler = async (event) => {
  // Authentication Guard: rejects unauthorized requests
  if (!isAuthenticated(event)) {
    return json(401, { status: 'error', message: 'Unauthorized. Session expired or not logged in.' });
  }

  const apiUrl = process.env.API_URL || DEFAULT_API_URL;

  try {
    let target = apiUrl;
    const method = event.httpMethod || 'GET';
    let body = event.body;

    if (method === 'POST' && body) {
      try {
        const parsed = JSON.parse(body);
        // Whitelist permitted actions
        const allowedActions = ['scan', 'register', 'getNextId', 'getTrainee'];
        if (parsed.action && !allowedActions.includes(parsed.action)) {
          return json(400, { status: 'error', message: 'Invalid action.' });
        }
        if (parsed.name) parsed.name = sanitizeString(parsed.name, 70);
        if (parsed.id) parsed.id = sanitizeString(parsed.id, 10);
        body = JSON.stringify(parsed);
      } catch (_) {
        return json(400, { status: 'error', message: 'Malformed JSON payload.' });
      }
    }

    if (method === 'GET' && event.rawQuery) {
      target += (target.includes('?') ? '&' : '?') + event.rawQuery;
    }

    const response = await requestWithRedirects(target, method, body);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      },
      body: response.body
    };
  } catch (err) {
    return json(500, { status: 'error', message: 'Internal server proxy error.' });
  }
};
