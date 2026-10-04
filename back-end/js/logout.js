document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/.netlify/functions/logout', { method: 'POST' });
    window.location.href = '/index.html';
});