exports.handler = async (event) => {
  const cookies = event.headers.cookie || '';
  const isAuthenticated = cookies.includes('auth_token=authenticated');

  if (isAuthenticated) {
    return { statusCode: 200, body: JSON.stringify({ authenticated: true }) };
  }

  return { statusCode: 401, body: JSON.stringify({ authenticated: false }) };
};