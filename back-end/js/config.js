const CONFIG = {
  API_URL: ''
};

const QUALIFICATIONS = {
  '1': 'Cookery',
  '2': 'House Keeping',
  '3': 'CSS',
  '4': 'EIM',
  '5': 'SMAW NC I',
  '6': 'SMAW NC II'
};

// Fetch API_URL from Netlify at runtime
const configReady = (async function loadConfig() {
  try {
    const response = await fetch('/.netlify/functions/get-config');
    const data = await response.json();
    CONFIG.API_URL = data.API_URL;
  } catch (err) {
    console.error('Failed to load configuration:', err);
  }
})();

// Validate a 5-digit trainee ID (e.g. "10001" → "60001")
function normalizeId(value) {
  const text = String(value).trim();
  if (!/^\d{5}$/.test(text)) return null;
  const prefix = text.charAt(0);
  if (!QUALIFICATIONS[prefix]) return null;
  const n    = Number(text);
  const base = parseInt(prefix, 10) * 10000;
  if (n <= base || n >= base + 10000) return null;
  return text;
}

function apiReady() {
  return CONFIG.API_URL && CONFIG.API_URL.indexOf('http') === 0;
}