const $ = function (id) { return document.getElementById(id); };

async function verifyPassword(e) {
  e.preventDefault();

  const enteredPassword = $('password-input').value;

  try {
    const response = await fetch('/.netlify/functions/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: enteredPassword })
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok || !contentType.includes('application/json')) {
      const bodyText = await response.text();
      let message = 'Authentication failed.';

      if (contentType.includes('application/json')) {
        try {
          const data = JSON.parse(bodyText);
          message = data.message || message;
        } catch (jsonError) {
          console.error('Failed to parse login error JSON:', jsonError);
        }
      } else {
        message = 'The login endpoint was not reached. Run the app with Netlify Dev or deploy it to Netlify so /.netlify/functions/login is available.';
      }

      throw new Error(message);
    }

    const data = await response.json();

    if (data.success) {
      window.location.href = 'front-end/html/home.html';
    } else {
      alert('Incorrect password. Access denied.');
    }
  } catch (err) {
    alert(err.message);
    console.error('Error submitting password:', err);
  }
}

document.getElementById('login-form').addEventListener('submit', verifyPassword);