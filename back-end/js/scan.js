// High-Accuracy QR Scanner & Trainee Registration Controller
// Supports 4-digit badges (0001) that become 5-digit Trainee IDs (QNNNN) upon qualification selection

const resultEl = document.getElementById('result');
const manualForm = document.getElementById('manual-form');
const manualInput = document.getElementById('manual-id');
const torchBtn = document.getElementById('torch');

// Quick registration modal elements
const regModal = document.getElementById('reg-modal');
const quickRegForm = document.getElementById('quick-reg-form');
const regBadgePreview = document.getElementById('reg-badge-preview');
const regQualSelect = document.getElementById('reg-qual');
const regNameInput = document.getElementById('reg-name');
const regIdPreview = document.getElementById('reg-id-preview');
const regCancelBtn = document.getElementById('reg-cancel');

// Scanner tuning: 1 read for instant accuracy, generous 3s debounce per unique code
const SAME_CODE_COOLDOWN_MS = 3000;
const REQUEST_TIMEOUT_MS = 10000;

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

// ---------- network communication ----------
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
  resultEl.className = ''; resultEl.textContent = 'Checking ' + id + '…';

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
      show('bad', data.message || 'Could not record. Scan again.');
    }
  } catch (err) {
    lastId = '';
    show('bad', 'No connection. Check internet and scan again.');
  } finally {
    setTimeout(function () { busy = false; }, 1200);
  }
}

// ---------- On-the-fly Trainee Registration Modal ----------
function updateGeneratedIdPreview() {
  const qp = regQualSelect.value;
  // Keeps the 4 digits exactly the same, only prepending the qualification digit!
  const fourDigits = currentScannedBadge.slice(-4);
  const assignedId = qp + fourDigits;
  regIdPreview.value = assignedId;
}

function openQuickRegistration(scannedCode) {
  currentScannedBadge = scannedCode.slice(-4);
  regBadgePreview.value = currentScannedBadge;
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
  const assignedId = regIdPreview.value.trim(); // e.g. 60001
  const name = regNameInput.value.trim();
  const qp = regQualSelect.value;
  if (!name || !assignedId) return;

  await configReady;
  if (!apiReady()) {
    alert('API URL is not configured yet.');
    return;
  }

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

    // Immediately record attendance for this trainee
    busy = false;
    record(assignedId);
  } catch (err) {
    alert('Failed to register trainee: ' + err.message);
  }
});

// ---------- high-accuracy decode handling ----------
function onScan(text) {
  if (busy || !regModal.hidden) return;
  const now = Date.now();
  const id = normalizeId(text);

  if (!id) {
    if (now - lastBadAt > 2500) { lastBadAt = now; show('bad', 'Invalid QR code'); }
    return;
  }

  // Same code still in front of camera: keep cooldown alive
  if (id === lastId && now - lastAt < SAME_CODE_COOLDOWN_MS) {
    lastAt = now;
    return;
  }

  // Instant 1-read recognition: fast and accurate
  record(id);
}

manualForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const id = normalizeId(manualInput.value);
  manualInput.value = '';
  if (!id) { show('bad', 'Enter a 4-digit badge (e.g. 0001) or 5-digit ID (e.g. 60001)'); return; }
  record(id);
});

// ---------- high-accuracy camera initialization ----------
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

  // Use native BarcodeDetector if available (hardware acceleration)
  scanner = scanner || new Html5Qrcode('reader', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });

  const baseConfig = {
    fps: 24, // High framerate for snappy recognition
    disableFlip: true,
    qrbox: function (viewfinderWidth, viewfinderHeight) {
      // 80% generous scan zone so user doesn't struggle to center the code
      const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8);
      return { width: edge, height: edge };
    }
  };

  // High-def 720p constraints: optimal crispness for QR edges without latency
  const hiRes = Object.assign({}, baseConfig, {
    videoConstraints: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 480 }
    }
  });

  try {
    try {
      await scanner.start({ facingMode: 'environment' }, hiRes, onScan, function () {});
    } catch (e) {
      await scanner.start({ facingMode: 'environment' }, baseConfig, onScan, function () {});
    }
    running = true;

    try {
      await scanner.applyVideoConstraints({
        advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }]
      });
    } catch (_) {}

    setupTorch();
    resultEl.textContent = 'Ready. Hold QR code in front of the camera.';
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || /permission/i.test(String(err)));
    show('bad', denied
      ? 'Camera blocked. Allow camera permissions or use manual entry.'
      : 'Camera unavailable. Use HTTPS or manual entry.');
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