const ALLOWED_ACCOUNTS = {
  '1trainee2026': '2026',
  '2trainee2026': '2026',
  '3trainee2026': '2026',
  '4trainee2026': '2026',
  '5trainee2026': '2026',
  '6trainee2026': '2026',
  '7trainee2026': '2026'
};

const $ = function (id) { return document.getElementById(id); };

async function verifyLogin(e) {
  e.preventDefault();

  const username = $('username-input').value.trim();
  const password = $('password-input').value.trim();

  // 1. Try Netlify serverless function if available
  try {
    const response = await fetch('/.netlify/functions/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        sessionStorage.setItem('jdvp_auth', 'true');
        window.location.href = 'front-end/html/home.html';
        return;
      }
    }
  } catch (_) {
    // Netlify function not reachable (e.g. running on GitHub Pages)
  }

  // 2. Client-side authentication fallback (works seamlessly on GitHub Pages)
  if (ALLOWED_ACCOUNTS[username] && ALLOWED_ACCOUNTS[username] === password) {
    sessionStorage.setItem('jdvp_auth', 'true');
    window.location.href = 'front-end/html/home.html';
  } else {
    alert('Incorrect username or password. Access denied.');
  }
}

document.getElementById('login-form').addEventListener('submit', verifyLogin);