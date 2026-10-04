(async () => {
    const response = await fetch('/.netlify/functions/check-auth');
    if (!response.ok) {
        window.location.href = '/index.html';
    }
})();