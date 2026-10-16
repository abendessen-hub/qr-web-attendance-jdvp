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