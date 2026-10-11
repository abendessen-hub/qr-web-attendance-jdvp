const $ = function (id) { return document.getElementById(id); };

function showToast(message, type = 'error') {
  const toast = $('form-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = 'toast toast-' + type + ' is-visible';

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3400);
}

function markLoginError() {
  const usernameInput = $('username-input');
  const passwordInput = $('password-input');
  const fieldPair = [usernameInput, passwordInput].filter(Boolean);

  fieldPair.forEach((field) => {
    field.classList.add('input-error');
    field.animate([
      { transform: 'translateX(0px)', borderColor: 'rgba(15,91,216,.35)' },
      { transform: 'translateX(-6px)', borderColor: 'rgba(190,24,93,.8)' },
      { transform: 'translateX(6px)', borderColor: 'rgba(190,24,93,.8)' },
      { transform: 'translateX(-4px)', borderColor: 'rgba(190,24,93,.8)' },
      { transform: 'translateX(0px)', borderColor: 'rgba(15,91,216,.35)' }
    ], {
      duration: 420,
      easing: 'cubic-bezier(.22,1,.36,1)'
    });
  });

  setTimeout(() => {
    fieldPair.forEach((field) => field.classList.remove('input-error'));
  }, 900);
}

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
      const btn = e.submitter || document.querySelector('#login-form button[type="submit"]');
      if (btn) {
        btn.classList.add('is-loading');
        btn.textContent = 'Signing in…';
      }
      window.location.href = '/home';
      return;
    }

    markLoginError();
    showToast(data.message || 'Incorrect username or password. Access denied.', 'error');
  } catch (_) {
    markLoginError();
    showToast('Unable to reach the sign-in service. Please try again.', 'error');
  }
}

document.getElementById('login-form').addEventListener('submit', verifyLogin);