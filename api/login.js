const { json, createToken, authCookie, parseJsonBody } = require('../api-lib/auth');

module.exports = async function login(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { success: false, message: 'Method Not Allowed' });
  }
  if (!process.env.AUTH_SECRET || !process.env.ACCOUNTS) {
    return json(res, 500, { success: false, message: 'Authentication is not configured.' });
  }

  let credentials;
  try {
    credentials = parseJsonBody(req);
  } catch (_) {
    return json(res, 400, { success: false, message: 'Invalid Request' });
  }

  const allowed = process.env.ACCOUNTS.split(',').map((pair) => {
    const separator = pair.indexOf(':');
    if (separator < 1) return null;
    return {
      username: pair.slice(0, separator).trim(),
      password: pair.slice(separator + 1).trim()
    };
  }).filter((account) => account && account.password);

  const { username, password } = credentials;
  const match = allowed.some((account) =>
    typeof username === 'string' && typeof password === 'string' &&
    account.username === username.trim() && account.password === password.trim()
  );

  if (match) {
    return json(res, 200, { success: true, message: 'Access Granted' }, {
      'Set-Cookie': authCookie(createToken())
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 600));
  return json(res, 401, { success: false, message: 'Invalid username or password.' });
};