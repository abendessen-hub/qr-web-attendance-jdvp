const isLocalPreview =
  window.location.protocol === 'file:' ||
  ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

if (!isLocalPreview) {
  (async () => {
    const response = await fetch('/api/check-auth');
    if (!response.ok) {
      window.location.href = '/index.html';
    }
  })();
}