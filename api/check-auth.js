const { json, getSession } = require('../api-lib/auth');

module.exports = function checkAuth(req, res) {
  try {
    const session = getSession(req);
    if (session) {
      return json(res, 200, {
        authenticated: true,
        qualification: session.qualification,
        admin: session.admin
      });
    }
    return json(res, 401, { authenticated: false });
  } catch (_) {
    return json(res, 500, { authenticated: false, message: 'Authentication is not configured.' });
  }
};