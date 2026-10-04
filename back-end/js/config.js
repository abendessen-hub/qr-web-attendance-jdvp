const CONFIG = {
  API_URL: '',
  MAX_ID: 400
};

// Return the fetch promise so other scripts can wait for it
const configReady = (async function loadConfig() {
  try {
    const response = await fetch('/.netlify/functions/get-config');
    const data = await response.json();
    CONFIG.API_URL = data.API_URL;
    CONFIG.MAX_ID = data.MAX_ID;
  } catch (err) {
    console.error('Failed to load configuration:', err);
  }
})();

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