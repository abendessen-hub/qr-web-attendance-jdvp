const https = require('https');
const http = require('http');

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
        // Google Apps Script redirects 302 to script.googleusercontent.com (always GET on redirect)
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

exports.handler = async (event) => {
  const apiUrl = process.env.API_URL || DEFAULT_API_URL;
  try {
    let target = apiUrl;
    const method = event.httpMethod || 'GET';
    const body = event.body;

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
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
