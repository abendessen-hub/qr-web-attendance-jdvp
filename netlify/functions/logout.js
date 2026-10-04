const { json, clearedCookie } = require('../lib/auth');

exports.handler = async () => {
  return json(200, { success: true }, { 'Set-Cookie': clearedCookie });
};