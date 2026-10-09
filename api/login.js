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

  const accountEntries = process.env.ACCOUNTS.split(',').map((pair) => pair.trim());
  if (accountEntries.length > 7 || accountEntries.some((pair) => {
    const separator = pair.indexOf(':');
    return separator < 1 || !pair.slice(separator + 1).trim();
  })) {
    return json(res, 500, { success: false, message: 'Account configuration is invalid.' });
  }

  const allowed = accountEntries.map((pair, index) => {
    const separator = pair.indexOf(':');
    const username = pair.slice(0, separator).trim();
    let password = pair.slice(separator + 1).trim();
    let qualification = index < 6 ? String(index + 1) : null;
    let admin = index === 6;
    const scopeMatch = password.match(/:(all|[1-6])$/i);
    if (scopeMatch) {
      password = password.slice(0, -scopeMatch[0].length);
      admin = scopeMatch[1].toLowerCase() === 'all';
      qualification = admin ? null : scopeMatch[1];
    }
    return { username, password, qualification, admin };
  });
  const usernames = new Set(allowed.map((account) => account.username));
  if (allowed.some((account) => !account.username || !account.password) || usernames.size !== allowed.length) {
    return json(res, 500, { success: false, message: 'Account configuration is invalid.' });
  }

  const { username, password } = credentials;
  const account = allowed.find((candidate) =>
    typeof username === 'string' && typeof password === 'string' &&
    candidate.username === username.trim() && candidate.password === password.trim()
  );

  if (account) {
    return json(res, 200, { success: true, message: 'Access Granted' }, {
      'Set-Cookie': authCookie(createToken({
        qualification: account.qualification,
        admin: account.admin
      }))
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 600));
  return json(res, 401, { success: false, message: 'Invalid username or password.' });
};