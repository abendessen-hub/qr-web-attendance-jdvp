exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': 'auth_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly'
    },
    body: JSON.stringify({ success: true })
  };
};