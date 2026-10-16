const $ = function (id) { return document.getElementById(id); };

function ensureNotificationStack() {
  let stack = $('notification-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'notification-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    document.body.appendChild(stack);
  }
  return stack;
}

export function showNotification(message, type = 'error', duration = 3400) {
  const stack = ensureNotificationStack();
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');

  const hideAfter = () => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 220);
  };

  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  clearTimeout(toast.hideTimer);
  toast.hideTimer = setTimeout(hideAfter, duration);
}

export const showToast = showNotification;