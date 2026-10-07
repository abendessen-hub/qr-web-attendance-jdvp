const { json, isAuthenticated } = require('../lib/auth');

const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwrFhdqB2zuFnvCYKnxCyBPVVE9nfWog1yVVF__9pfi1pqueKfFhBLrOlVQmJa9fgNWXQ/exec';

exports.handler = async (event) => {
  // Only logged-in users may learn the Apps Script URL.
  if (!isAuthenticated(event)) {
    return json(401, { message: 'Not logged in' });
  }
  return json(200, {
    API_URL: process.env.API_URL || DEFAULT_API_URL,
    MAX_ID: 400
  });
};