const $ = function (id) { return document.getElementById(id); };

async function verifyLogin(e) {
  e.preventDefault();

  const username = $('username-input').value.trim();
  const password = $('password-input').value.trim();

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });

    const data = await response.json();
    if (response.ok && data.success) {
      window.location.href = '/home';
      return;
    }
    alert(data.message || 'Incorrect username or password. Access denied.');
  } catch (_) {
    alert('Unable to reach the sign-in service. Please try again.');
  }
}

document.getElementById('login-form').addEventListener('submit', verifyLogin);