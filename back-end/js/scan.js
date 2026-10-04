// QR scanner: html5-qrcode 2.3.x
// Expects these globals from your page: CONFIG, configReady, apiReady(), normalizeId()
// Optional: <button id="torch" hidden>Torch</button> for a flashlight toggle.

const resultEl = document.getElementById('result');
const manualForm = document.getElementById('manual-form');
const manualInput = document.getElementById('manual-id');
const torchBtn = document.getElementById('torch');

const REQUIRED_READS = 2;          // same code must decode this many times...
const READ_WINDOW_MS = 1500;       // ...within this window (filters misreads)
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
  } catch (_) { /* audio is optional */ }
}

function show(kind, message) {
  resultEl.className = kind;
  resultEl.textContent = message;
  if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 120 : [80, 60, 80]);
  beep(kind === 'ok');
}

// Browsers only allow audio after a user gesture
window.addEventListener('pointerdown', function () {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) {}
}, { once: true });

// ---------- network ----------
async function postId(id) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify({ id: id }),
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
    const data = await postId(id);
    if (data.status === 'ok') show('ok', id + ' recorded at ' + data.time);
    else if (data.status === 'duplicate') show('dup', id + ' already recorded today');
    else if (data.status === 'invalid') show('bad', 'Invalid QR code');
    else show('bad', 'Could not record. Scan again.');
  } catch (err) {
    lastId = '';   // allow an immediate rescan
    show('bad', 'No connection. Scan again.');
  } finally {
    setTimeout(function () { busy = false; }, 1200);
  }
}

// ---------- decode handling ----------
function onScan(text) {
  if (busy) return;
  const now = Date.now();
  const id = normalizeId(text);

  if (!id) {
    candidate = { id: '', count: 0, first: 0 };
    if (now - lastBadAt > 2000) { lastBadAt = now; show('bad', 'Invalid QR code'); }
    return;
  }

  // Same code still in front of the camera: keep the cooldown alive, do nothing
  if (id === lastId && now - lastAt < SAME_CODE_COOLDOWN_MS) { lastAt = now; return; }

  // Require repeated identical reads before trusting a code
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
  if (!id) { show('bad', 'Invalid ID'); return; }
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
  } catch (_) { /* torch not available */ }
}

async function startScanner() {
  if (running) return;

  scanner = scanner || new Html5Qrcode('reader', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],   // QR only: faster, fewer false hits
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }, // native detector where available
    verbose: false
  });

  const baseConfig = {
    fps: 15,
    disableFlip: true,   // skip mirrored decode attempts
    // scan area = 70% of the shorter side, so a code doesn't need to be perfectly centered
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
      // Some devices reject the high-res constraints, so fall back to plain settings
      await scanner.start({ facingMode: 'environment' }, baseConfig, onScan, function () {});
    }
    running = true;

    // Ask for continuous autofocus (ignored where unsupported)
    try { await scanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
    setupTorch();

    resultEl.textContent = 'Ready. Hold a QR code in front of the camera.';
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || /permission/i.test(String(err)));
    show('bad', denied
      ? 'Camera blocked. Allow camera access or use manual entry.'
      : 'Camera unavailable. Use HTTPS or manual entry.');
  }
}

async function stopScanner() {
  if (!running) return;
  running = false;
  try { await scanner.stop(); } catch (_) {}
}

// Release the camera when the tab is hidden, restart when it comes back
document.addEventListener('visibilitychange', function () {
  if (document.hidden) stopScanner();
  else startScanner();
});

startScanner();