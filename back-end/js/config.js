const CONFIG = {
  API_URL: '/api/api',
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

const configReady = Promise.resolve();

// Validates and sanitizes 4-digit badge IDs (e.g. "0001") or 5-digit Trainee IDs (e.g. "60001")
function normalizeId(value) {
  const text = String(value || '').replace(/[^\d]/g, '').trim();
  
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

function sanitizeText(str, maxLen = 70) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>'"/\\;`]/g, '').trim().slice(0, maxLen);
}

function apiReady() {
  return true;
}