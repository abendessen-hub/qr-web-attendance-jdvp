(async () => {
    const response = await fetch('/api/check-auth');
    if (!response.ok) {
        window.location.href = '/index.html';
    }
})();