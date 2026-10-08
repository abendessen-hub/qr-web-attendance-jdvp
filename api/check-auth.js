const { json, isAuthenticated } = require('../api-lib/auth');

module.exports = function checkAuth(req, res) {
  try {
    if (isAuthenticated(req)) {
      return json(res, 200, { authenticated: true });
    }
    return json(res, 401, { authenticated: false });
  } catch (_) {
    return json(res, 500, { authenticated: false, message: 'Authentication is not configured.' });
  }
};