const https = require('node:https');
const http = require('node:http');
const { json, getSession, parseJsonBody } = require('../api-lib/auth');

function requestWithRedirects(targetUrl, method, postBody, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, {
      method,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectedUrl = new URL(response.headers.location, url).toString();
        return requestWithRedirects(redirectedUrl, 'GET', null, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: data }));
    });

    request.on('error', reject);
    if (postBody && method === 'POST') request.write(postBody);
    request.end();
  });
}

function sanitizeString(value, maxLength = 80) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>'"/\\;`]/g, '').trim().slice(0, maxLength);
}

module.exports = async function proxy(req, res) {
  let session;
  try {
    session = getSession(req);
    if (!session) {
      return json(res, 401, { status: 'error', message: 'Unauthorized. Session expired or not logged in.' });
    }
  } catch (_) {
    return json(res, 500, { status: 'error', message: 'Authentication is not configured.' });
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return json(res, 405, { status: 'error', message: 'Method Not Allowed' });
  }
  if (!process.env.API_URL) {
    return json(res, 500, { status: 'error', message: 'API_URL is not configured.' });
  }

  try {
    let target = process.env.API_URL;
    let body;

    if (req.method === 'POST') {
      const parsed = parseJsonBody(req);
      const allowedActions = ['scan', 'register', 'getNextId', 'getTrainee'];
      if (!allowedActions.includes(parsed.action)) {
        return json(res, 400, { status: 'error', message: 'Invalid action.' });
      }
      if (!session.admin) {
        const qualification = session.qualification;
        const suppliedQualification = parsed.qualification;
        if (suppliedQualification !== undefined && String(suppliedQualification) !== qualification) {
          return json(res, 403, { status: 'error', message: 'This account can only access its assigned qualification.' });
        }
        if (parsed.action === 'register' || parsed.action === 'getNextId') {
          if (String(suppliedQualification || '') !== qualification) {
            return json(res, 403, { status: 'error', message: 'This account can only access its assigned qualification.' });
          }
        }
        if (parsed.action === 'register' && parsed.id &&
            !new RegExp('^' + qualification + '\\d{4}$').test(String(parsed.id).trim())) {
          return json(res, 403, { status: 'error', message: 'This account can only register trainees for its assigned qualification.' });
        }
        if (parsed.action === 'scan' || parsed.action === 'getTrainee') {
          const id = String(parsed.id || '').trim();
          if (!/^\d{1,5}$/.test(id)) {
            return json(res, 400, { status: 'error', message: 'Invalid trainee ID.' });
          }
          if (id.length === 5 && id.charAt(0) !== qualification) {
            return json(res, 403, { status: 'error', message: 'This account can only access its assigned qualification.' });
          }
          parsed.id = id.length === 5 ? id : qualification + id.padStart(4, '0');
          parsed.qualification = qualification;
        }
      }
      if (parsed.name) parsed.name = sanitizeString(parsed.name, 70);
      if (parsed.id) parsed.id = sanitizeString(parsed.id, 10);
      body = JSON.stringify(parsed);
    }

    if (req.method === 'GET' && req.url) {
      const requestUrl = new URL(req.url, 'https://vercel.invalid');
      const requestedQualification = requestUrl.searchParams.get('qualification');
      if (!session.admin && requestedQualification && requestedQualification !== session.qualification) {
        return json(res, 403, { status: 'error', message: 'This account can only access its assigned qualification.' });
      }
      if (!session.admin) requestUrl.searchParams.set('qualification', session.qualification);
      const query = requestUrl.search;
      if (query) target += (target.includes('?') ? '&' : '?') + query.slice(1);
    }

    const response = await requestWithRedirects(target, req.method, body);
    let responseBody;
    try {
      responseBody = JSON.parse(response.body);
    } catch (_) {
      return json(res, 502, {
        status: 'error',
        message: 'Google Apps Script returned HTML instead of JSON. Redeploy it as a Web app with access set to Anyone, then verify API_URL uses the current /exec URL.'
      });
    }

    if (!session.admin && responseBody && typeof responseBody === 'object') {
      const qualificationNames = {
        '1': 'Cookery',
        '2': 'House Keeping',
        '3': 'CSS',
        '4': 'EIM',
        '5': 'SMAW NC I',
        '6': 'SMAW NC II'
      };
      const qualificationName = qualificationNames[session.qualification];
      for (const key of ['records', 'trainees']) {
        if (Array.isArray(responseBody[key])) {
          responseBody[key] = responseBody[key].filter((record) =>
            record && record.qualification === qualificationName
          );
        }
      }
    }

    res.statusCode = response.statusCode || 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(responseBody));
  } catch (_) {
    return json(res, 500, { status: 'error', message: 'Internal server proxy error.' });
  }
};