// Continuous QR scanner with live camera preview and fallback connection
// Supports 4-digit badges (0001) that become 5-digit Trainee IDs (QNNNN)

const resultEl = document.getElementById('result');
const manualForm = document.getElementById('manual-form');
const manualInput = document.getElementById('manual-id');
const torchBtn = document.getElementById('torch');
const cameraStatus = document.getElementById('camera-status');
const scanQualSelect = document.getElementById('scan-qual');
const qualHint = document.getElementById('qual-hint');

// Quick registration modal elements
const regModal = document.getElementById('reg-modal');
const quickRegForm = document.getElementById('quick-reg-form');
const regBadgePreview = document.getElementById('reg-badge-preview');
const regQualSelect = document.getElementById('reg-qual');
const regNameInput = document.getElementById('reg-name');
const regIdPreview = document.getElementById('reg-id-preview');
const regCancelBtn = document.getElementById('reg-cancel');

const SAME_CODE_COOLDOWN_MS = 3000;
const REQUEST_TIMEOUT_MS = 30000;

let busy = false;
let lastId = '';
let lastAt = 0;
let lastBadAt = 0;
let scanner = null;
let running = false;
let audioCtx = null;
let currentScannedBadge = '0001';

// ---------- audio & haptic feedback ----------
function beep(ok) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.09;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + (ok ? 0.12 : 0.25));
  } catch (_) {}
}

function show(kind, message) {
  resultEl.className = kind;
  resultEl.textContent = message;
  if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 120 : [80, 60, 80]);
  beep(kind === 'ok');
}

window.addEventListener('pointerdown', function () {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) {}
}, { once: true });

// ---------- network communication with fallback ----------
async function postAction(payload) {
  const urlsToTry = [
    CONFIG.API_URL,     // Vercel proxy (bypasses browser CORS & redirects)
    CONFIG.FALLBACK_URL // 2. Direct Apps Script URL
  ].filter(Boolean);

  let lastError = null;

  for (const url of urlsToTry) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('The attendance API returned a non-JSON response. Check the Apps Script deployment and API_URL.');
      }

      let data;
      try {
        data = await res.json();
      } catch (_) {
        throw new Error('The attendance API returned invalid JSON.');
      }
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      return data;
    } catch (err) {
      if (ctrl.signal.aborted) {
        const timeoutError = new Error('No response within 30 seconds. Attendance may already have been recorded. Check today\'s attendance before scanning again.');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      lastError = err;
      console.warn('Request failed on ' + url + ':', err);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('All connection attempts failed.');
}

async function record(id) {
  if (busy) return;

  busy = true; lastId = id; lastAt = Date.now();
  resultEl.className = ''; resultEl.textContent = 'Recording ' + id + '…';

  try {
    const data = await postAction({ action: 'scan', id: id });
    
    if (data.status === 'time_in') {
      show('ok', (data.name || 'Trainee') + ' (' + (data.id || id) + ')\nTime In: ' + data.time);
    } else if (data.status === 'time_out') {
      show('ok', (data.name || 'Trainee') + ' (' + (data.id || id) + ')\nTime Out: ' + data.time);
    } else if (data.status === 'not_time_out') {
      show('dup', 'Not Time out yet');
    } else if (data.status === 'already_completed') {
      show('dup', 'Attendance already completed for today.');
    } else if (data.status === 'not_registered') {
      show('bad', 'Badge ' + id + ' is not registered yet.');
      openQuickRegistration(id);
    } else if (data.status === 'invalid') {
      show('bad', 'Invalid QR code.');
    } else {
      show('bad', data.message || 'Could not record. Try again.');
    }
  } catch (err) {
    lastId = '';
    if (err.name === 'TimeoutError') {
      show('dup', err.message);
    } else {
      show('bad', 'Connection error: ' + (err.message || 'Please check network and try again.'));
    }
  } finally {
    setTimeout(function () { busy = false; }, 1200);
  }
}

// ---------- Qualification Selection & Persistence ----------
function getSelectedQualification() {
  return scanQualSelect ? scanQualSelect.value : '';
}

function updateQualHint() {
  const qp = getSelectedQualification();
  if (!qp || !QUALIFICATIONS[qp]) {
    if (qualHint) {
      qualHint.innerHTML = '⚠️ <strong>Please select a qualification first</strong> before scanning or manual entry.';
    }
    if (!busy) {
      resultEl.textContent = 'Please select a qualification above to begin.';
    }
  } else {
    const qualName = QUALIFICATIONS[qp];
    if (qualHint) {
      qualHint.innerHTML = 'Active: <strong>' + qualName + '</strong> (4-digit badge 0001 &rarr; Trainee ID <strong>' + qp + '0001</strong>)';
    }
    if (!busy) {
      resultEl.textContent = 'Ready for ' + qualName + '. Hold QR code steady within the camera frame.';
    }
  }
}

// Restore saved qualification if available
const savedQual = localStorage.getItem('jdvp_selected_qual');
if (savedQual && QUALIFICATIONS[savedQual] && scanQualSelect) {
  scanQualSelect.value = savedQual;
}
updateQualHint();

if (scanQualSelect) {
  scanQualSelect.addEventListener('change', function () {
    const val = scanQualSelect.value;
    localStorage.setItem('jdvp_selected_qual', val);
    updateQualHint();
    if (regQualSelect) {
      regQualSelect.value = val;
      updateGeneratedIdPreview();
    }
  });
}

function resolveTraineeId(rawText) {
  const selectedQual = getSelectedQualification();
  if (!selectedQual || !QUALIFICATIONS[selectedQual]) {
    show('bad', 'Please select a qualification first.');
    if (scanQualSelect) scanQualSelect.focus();
    return null;
  }

  const norm = normalizeId(rawText);
  if (!norm) return null;

  // 4-digit badge (e.g. "0001") -> convert to 5-digit Trainee ID (e.g. "10001" or "20002")
  if (norm.length === 4) {
    return selectedQual + norm;
  }

  // 5-digit Trainee ID (e.g. "10001") -> verify qualification prefix matches
  if (norm.length === 5) {
    const prefix = norm.charAt(0);
    if (prefix !== selectedQual) {
      show('bad', 'ID ' + norm + ' belongs to ' + (QUALIFICATIONS[prefix] || 'another qualification') + ', not ' + QUALIFICATIONS[selectedQual] + '.');
      return null;
    }
    return norm;
  }

  return null;
}

// ---------- On-the-fly Trainee Registration Modal ----------
function updateGeneratedIdPreview() {
  const qp = regQualSelect.value;
  const fourDigits = currentScannedBadge.slice(-4);
  const assignedId = qp + fourDigits;
  regIdPreview.value = assignedId;
}

function openQuickRegistration(scannedCode) {
  const selectedQual = getSelectedQualification() || '1';
  currentScannedBadge = scannedCode.slice(-4);
  regBadgePreview.value = currentScannedBadge;
  regQualSelect.value = selectedQual;
  regNameInput.value = '';
  updateGeneratedIdPreview();
  regModal.hidden = false;
  regNameInput.focus();
}

function closeQuickRegistration() {
  regModal.hidden = true;
  regNameInput.value = '';
}

regQualSelect.addEventListener('change', updateGeneratedIdPreview);
regCancelBtn.addEventListener('click', closeQuickRegistration);

quickRegForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  const assignedId = normalizeId(regIdPreview.value);
  const name = sanitizeText(regNameInput.value);
  const qp = sanitizeText(regQualSelect.value);
  if (!name || !assignedId) return;

  show('', 'Registering ' + name + ' (' + assignedId + ')…');
  try {
    const regRes = await postAction({
      action: 'register',
      id: assignedId,
      name: name,
      qualification: qp
    });

    if (regRes.status !== 'ok') {
      alert(regRes.message || 'Registration failed.');
      return;
    }

    closeQuickRegistration();
    show('ok', 'Registered: ' + regRes.name + ' (' + assignedId + '). Recording Time In…');

    busy = false;
    record(assignedId);
  } catch (err) {
    alert('Failed to register trainee: ' + err.message);
  }
});

// ---------- Continuous Live Scan ----------
function onScan(text) {
  if (busy || !regModal.hidden) return;
  const now = Date.now();

  const selectedQual = getSelectedQualification();
  if (!selectedQual) {
    if (now - lastBadAt > 2000) {
      lastBadAt = now;
      show('bad', 'Please select a qualification first.');
      if (scanQualSelect) scanQualSelect.focus();
    }
    return;
  }

  const id = resolveTraineeId(text);
  if (!id) {
    if (now - lastBadAt > 2500) { lastBadAt = now; show('bad', 'Invalid QR code'); }
    return;
  }

  if (id === lastId && now - lastAt < SAME_CODE_COOLDOWN_MS) {
    lastAt = now;
    return;
  }

  record(id);
}

// ---------- Manual Form Entry ----------
manualForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const selectedQual = getSelectedQualification();
  if (!selectedQual) {
    show('bad', 'Please select a qualification first.');
    if (scanQualSelect) scanQualSelect.focus();
    return;
  }

  const raw = manualInput.value.trim();
  const id = resolveTraineeId(raw);
  manualInput.value = '';
  if (!id) {
    show('bad', 'Please enter a 4-digit badge (e.g. 0001) or 5-digit ID for ' + QUALIFICATIONS[selectedQual]);
    return;
  }
  record(id);
});

// ---------- Camera Initialization ----------
function setupTorch() {
  if (!torchBtn) return;
  try {
    const torch = scanner.getRunningTrackCameraCapabilities().torchFeature();
    if (!torch.isSupported()) return;
    torchBtn.hidden = false;
    torchBtn.onclick = async function () {
      try {
        await torch.apply(!torch.value());
        torchBtn.setAttribute('aria-pressed', String(torch.value()));
      } catch (_) {}
    };
  } catch (_) {}
}

async function startScanner() {
  if (running) return;
  cameraStatus.hidden = false;
  cameraStatus.textContent = 'Starting camera…';

  scanner = scanner || new Html5Qrcode('reader', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });

  const baseConfig = {
    fps: 24,
    disableFlip: true,
    qrbox: function (w, h) {
      const edge = Math.floor(Math.min(w, h) * 0.75);
      return { width: edge, height: edge };
    }
  };

  const hiRes = Object.assign({}, baseConfig, {
    videoConstraints: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920, min: 640 },
      height: { ideal: 1080, min: 480 }
    }
  });

  try {
    try {
      await scanner.start({ facingMode: 'environment' }, hiRes, onScan, function () {});
    } catch (e) {
      await scanner.start({ facingMode: 'environment' }, baseConfig, onScan, function () {});
    }
    running = true;
    cameraStatus.hidden = true;

    try {
      await scanner.applyVideoConstraints({
        advanced: [
          { focusMode: 'continuous' },
          { exposureMode: 'continuous' },
          { whiteBalanceMode: 'continuous' }
        ]
      });
    } catch (_) {}

    setupTorch();
    updateQualHint();
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || /permission/i.test(String(err)));
    cameraStatus.hidden = false;
    cameraStatus.textContent = denied
      ? 'Camera access is blocked. Allow camera permission in your browser settings, then reload.'
      : 'Camera unavailable. Use HTTPS, check browser camera permission, or use manual entry below.';
    show('bad', denied
      ? 'Camera blocked. Allow camera permissions or use manual entry below.'
      : 'Camera unavailable. Use HTTPS or manual entry below.');
  }
}

async function stopScanner() {
  if (!running) return;
  running = false;
  try { await scanner.stop(); } catch (_) {}
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) stopScanner();
  else startScanner();
});

startScanner();