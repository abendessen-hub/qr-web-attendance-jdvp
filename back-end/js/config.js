const CONFIG = {
  API_URL: '',
  MAX_ID: 400
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

// Normalizes 4-digit badge IDs (e.g. "0001") or 5-digit Trainee IDs (e.g. "60001")
function normalizeId(value) {
  const text = String(value || '').trim();
  
  // 4-digit badge code (e.g. "0001" to "0400")
  if (/^\d{1,4}$/.test(text)) {
    const n = Number(text);
    if (n >= 1 && n <= 9999) {
      return String(n).padStart(4, '0');
    }
  }

  // 5-digit Trainee ID (e.g. "10001" to "69999")
  if (/^\d{5}$/.test(text)) {
    const prefix = text.charAt(0);
    if (QUALIFICATIONS[prefix]) {
      return text;
    }
  }

  return null;
}

function apiReady() {
  return CONFIG.API_URL && CONFIG.API_URL.indexOf('http') === 0;
}