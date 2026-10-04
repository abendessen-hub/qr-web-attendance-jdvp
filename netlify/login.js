exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const { password } = JSON.parse(event.body);
    const rawPasswords = process.env.PASSWORDS || '';
    const allowedPasswords = rawPasswords.split(',').map(p => p.trim());

    if (allowedPasswords.includes(password)) {
      return {
        statusCode: 200,
        headers: {
          // Sets a secure, HTTP-only cookie valid across the entire site for 1 day (86400 seconds)
          'Set-Cookie': 'auth_token=authenticated; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400'
        },
        body: JSON.stringify({ success: true, message: 'Access Granted' })
      };
    }

    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: 'Invalid Password' })
    };
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid Request' }) };
  }
};