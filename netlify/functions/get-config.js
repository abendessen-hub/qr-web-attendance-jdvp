exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      API_URL: process.env.API_URL || '',
      MAX_ID: 400
    })
  };
};