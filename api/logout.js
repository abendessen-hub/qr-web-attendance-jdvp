const { json, clearedCookie } = require('../api-lib/auth');

module.exports = function logout(req, res) {
  return json(res, 200, { success: true }, { 'Set-Cookie': clearedCookie });
};