const { json, createToken, authCookie } = require('../lib/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method Not Allowed' });
  }

  if (!process.env.AUTH_SECRET || !process.env.PASSWORDS) {
    return json(500, { success: false, message: 'Server is not configured (missing PASSWORDS or AUTH_SECRET).' });
  }

  let password;
  try {
    ({ password } = JSON.parse(event.body || '{}'));
  } catch (err) {
    return json(400, { success: false, message: 'Invalid Request' });
  }

  const allowed = process.env.PASSWORDS.split(',').map(p => p.trim()).filter(Boolean);

  if (typeof password === 'string' && allowed.includes(password.trim())) {
    return json(200, { success: true, message: 'Access Granted' }, {
      'Set-Cookie': authCookie(createToken())
    });
  }

  // Small delay slows down guessing a 4-digit password.
  await new Promise(resolve => setTimeout(resolve, 600));
  return json(401, { success: false, message: 'Invalid Password' });
};