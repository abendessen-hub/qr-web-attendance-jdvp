// Paste the Web app URL from Apps Script (Deploy > Manage deployments). It ends in /exec.
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwcW-coZEJOjq2Pg8u9ReNsvvMEOY9eLgQsIsNi8yoC5pzOdapOxSVrGzNlA7l7FotR/exec',
  MAX_ID: 400
};

// Turns "1", "01" or "0001" into "0001". Returns null if the ID is not valid.
function normalizeId(value) {
  const text = String(value).trim();
  if (!/^\d{1,4}$/.test(text)) return null;
  const n = Number(text);
  if (n < 1 || n > CONFIG.MAX_ID) return null;
  return String(n).padStart(4, '0');
}

function apiReady() {
  return CONFIG.API_URL && CONFIG.API_URL.indexOf('http') === 0;
}