const { json, isAuthenticated } = require('../lib/auth');

exports.handler = async (event) => {
  if (isAuthenticated(event)) {
    return json(200, { authenticated: true });
  }
  return json(401, { authenticated: false });
};