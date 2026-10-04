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

    const data = await response.json();

    if (data.success) {
      // Cookie is automatically saved by the browser
      window.location.href = 'front-end/html/home.html';
    } else {
      alert('Incorrect password. Access denied.');
    }
  } catch (err) {
    console.error('Error submitting password:', err);
  }
}

async function test(e) {
    e.preventDefault();
    
    window.location.href = 'front-end/html/home.html'; // adjust path to home if needed
    //alert('Test function called.'); // Placeholder for actual test logic
}

document.getElementById('login-form').addEventListener('submit', test);