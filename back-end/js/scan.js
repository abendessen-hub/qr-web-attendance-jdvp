// QR scanner: html5-qrcode 2.3.x
// Integrates with Google Apps Script backend (Code.gs)
// Handles: Time In, Time Out (3-5 PM), Not Time out yet, Completed today, On-the-fly Trainee Registration upon scan

const resultEl = document.getElementById('result');
const manualForm = document.getElementById('manual-form');
const manualInput = document.getElementById('manual-id');
const torchBtn = document.getElementById('torch');

// Quick registration modal elements
const regModal = document.getElementById('reg-modal');
const quickRegForm = document.getElementById('quick-reg-form');
const regQualSelect = document.getElementById('reg-qual');
const regNameInput = document.getElementById('reg-name');
const regIdPreview = document.getElementById('reg-id-preview');
const regCancelBtn = document.getElementById('reg-cancel');

const REQUIRED_READS = 2;
const READ_WINDOW_MS = 1500;
const SAME_CODE_COOLDOWN_MS = 4000;
const REQUEST_TIMEOUT_MS = 10000;

let busy = false;
let lastId = '';
let lastAt = 0;
let lastBadAt = 0;
let candidate = { id: '', count: 0, first: 0 };
let scanner = null;
let running = false;
let audioCtx = null;

// ---------- feedback ----------
function beep(ok) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
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

// ---------- network ----------
async function postAction(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function record(id) {
  if (busy) return;

  await configReady;
  if (!apiReady()) {
    show('bad', 'API URL is not configured yet.');
    return;
  }

  busy = true; lastId = id; lastAt = Date.now();
  resultEl.className = ''; resultEl.textContent = 'Checking Trainee ' + id + '…';
  try {
    const data = await postAction({ action: 'scan', id: id });
    
    if (data.status === 'time_in') {
      show('ok', (data.name || 'Trainee') + ' (' + id + ') — Time In: ' + data.time);
    } else if (data.status === 'time_out') {
      show('ok', (data.name || 'Trainee') + ' (' + id + ') — Time Out: ' + data.time);
    } else if (data.status === 'not_time_out') {
      show('dup', 'Not Time out yet');
    } else if (data.status === 'already_completed') {
      show('dup', 'Attendance already completed for today.');
    } else if (data.status === 'not_registered') {
      show('bad', 'Trainee ' + id + ' is not registered yet.');
      openQuickRegistration(id);
    } else if (data.status === 'invalid') {
      show('bad', 'Invalid Trainee QR code.');
    } else {
      show('bad', data.message || 'Could not record. Scan again.');
    }
  } catch (err) {
    lastId = '';
    show('bad', 'No connection. Check internet and scan again.');
  } finally {
    setTimeout(function () { busy = false; }, 1500);
  }
}

// ---------- On-the-fly Trainee Registration ----------
function openQuickRegistration(scannedId) {
  if (scannedId && scannedId.length === 5) {
    const prefix = scannedId.charAt(0);
    if (QUALIFICATIONS[prefix]) {
      regQualSelect.value = prefix;
    }
  }
  regIdPreview.value = scannedId;
  regNameInput.value = '';
  regModal.hidden = false;
  regNameInput.focus();
}

function closeQuickRegistration() {
  regModal.hidden = true;
  regNameInput.value = '';
}

regCancelBtn.addEventListener('click', closeQuickRegistration);

quickRegForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  const id = regIdPreview.value.trim();
  const name = regNameInput.value.trim();
  const qp = regQualSelect.value;
  if (!name || !id) return;

  await configReady;
  if (!apiReady()) {
    alert('API URL is not configured yet.');
    return;
  }

  show('', 'Registering ' + name + ' (' + id + ')…');
  try {
    const regRes = await postAction({ action: 'register', id: id, name: name, qualification: qp });
    if (regRes.status !== 'ok') {
      alert(regRes.message || 'Registration failed.');
      return;
    }

    closeQuickRegistration();
    show('ok', 'Registered: ' + regRes.name + ' (' + id + '). Recording attendance…');

    // Immediately record attendance for the newly registered trainee
    busy = false;
    record(id);
  } catch (err) {
    alert('Failed to register trainee: ' + err.message);
  }
});

// ---------- decode handling ----------
function onScan(text) {
  if (busy || !regModal.hidden) return;
  const now = Date.now();
  const id = normalizeId(text);

  if (!id) {
    candidate = { id: '', count: 0, first: 0 };
    if (now - lastBadAt > 2500) { lastBadAt = now; show('bad', 'Invalid QR code'); }
    return;
  }

  if (id === lastId && now - lastAt < SAME_CODE_COOLDOWN_MS) { lastAt = now; return; }

  if (candidate.id === id && now - candidate.first <= READ_WINDOW_MS) {
    candidate.count++;
  } else {
    candidate = { id: id, count: 1, first: now };
  }
  if (candidate.count < REQUIRED_READS) return;

  candidate = { id: '', count: 0, first: 0 };
  record(id);
}

manualForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const id = normalizeId(manualInput.value);
  manualInput.value = '';
  if (!id) { show('bad', 'Please enter a valid 5-digit Trainee ID (e.g. 60001)'); return; }
  record(id);
});

// ---------- camera ----------
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

  scanner = scanner || new Html5Qrcode('reader', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });

  const baseConfig = {
    fps: 15,
    disableFlip: true,
    qrbox: function (w, h) {
      const s = Math.floor(Math.min(w, h) * 0.7);
      return { width: s, height: s };
    }
  };

  const hiRes = Object.assign({}, baseConfig, {
    videoConstraints: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  });

  try {
    try {
      await scanner.start({ facingMode: 'environment' }, hiRes, onScan, function () {});
    } catch (e) {
      await scanner.start({ facingMode: 'environment' }, baseConfig, onScan, function () {});
    }
    running = true;

    try { await scanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
    setupTorch();

    resultEl.textContent = 'Ready. Hold a trainee QR code in front of the camera.';
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || /permission/i.test(String(err)));
    show('bad', denied
      ? 'Camera blocked. Allow camera access or enter Trainee ID below.'
      : 'Camera unavailable. Use HTTPS or enter Trainee ID below.');
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