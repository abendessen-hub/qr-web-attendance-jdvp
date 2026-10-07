const { json, createToken, authCookie } = require('../lib/auth');

// Exactly 7 authorized accounts as specified in the requirements
const DEFAULT_ACCOUNTS = [
  { username: '1trainee2026', password: '2026' },
  { username: '2trainee2026', password: '2026' },
  { username: '3trainee2026', password: '2026' },
  { username: '4trainee2026', password: '2026' },
  { username: '5trainee2026', password: '2026' },
  { username: '6trainee2026', password: '2026' },
  { username: '7trainee2026', password: '2026' }
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method Not Allowed' });
  }

  const authSecret = process.env.AUTH_SECRET || 'jdvp-attendance-default-secret-key-2026';

  let username, password;
  try {
    ({ username, password } = JSON.parse(event.body || '{}'));
  } catch (err) {
    return json(400, { success: false, message: 'Invalid Request' });
  }

  // Parse ACCOUNTS from env if provided; otherwise use DEFAULT_ACCOUNTS
  let allowed = DEFAULT_ACCOUNTS;
  if (process.env.ACCOUNTS) {
    allowed = process.env.ACCOUNTS.split(',').map(pair => {
      const [u, p] = pair.trim().split(':');
      return { username: u, password: p };
    });
  }

  const match = allowed.find(
    a => typeof username === 'string' && typeof password === 'string' &&
         a.username === username.trim() && a.password === password.trim()
  );

  if (match) {
    return json(200, { success: true, message: 'Access Granted' }, {
      'Set-Cookie': authCookie(createToken())
    });
  }

  // Small delay slows down brute force attempts
  await new Promise(resolve => setTimeout(resolve, 600));
  return json(401, { success: false, message: 'Invalid username or password.' });
};