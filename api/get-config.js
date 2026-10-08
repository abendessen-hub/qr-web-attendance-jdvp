const { json, isAuthenticated } = require('../api-lib/auth');

module.exports = function getConfig(req, res) {
  try {
    if (!isAuthenticated(req)) {
      return json(res, 401, { message: 'Not logged in' });
    }
  } catch (_) {
    return json(res, 500, { message: 'Authentication is not configured.' });
  }

  if (!process.env.API_URL) {
    return json(res, 500, { message: 'API_URL is not configured.' });
  }
  return json(res, 200, { API_URL: process.env.API_URL, MAX_ID: 400 });
};