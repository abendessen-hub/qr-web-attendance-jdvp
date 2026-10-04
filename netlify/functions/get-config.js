const { json, isAuthenticated } = require('../lib/auth');

exports.handler = async (event) => {
  // Only logged-in users may learn the Apps Script URL.
  if (!isAuthenticated(event)) {
    return json(401, { message: 'Not logged in' });
  }
  return json(200, {
    API_URL: process.env.API_URL || '',
    MAX_ID: 400
  });
};