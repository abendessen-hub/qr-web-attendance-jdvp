const { json, getSession } = require('../api-lib/auth');

module.exports = function getConfig(req, res) {
  try {
    const session = getSession(req);
    if (!session) {
      return json(res, 401, { message: 'Not logged in' });
    }
    if (!process.env.API_URL) {
      return json(res, 500, { message: 'API_URL is not configured.' });
    }
    return json(res, 200, {
      API_URL: '/api/api',
      MAX_ID: 400,
      qualification: session.qualification,
      admin: session.admin
    });
  } catch (_) {
    return json(res, 500, { message: 'Authentication is not configured.' });
  }
};