// High-Accuracy Scanner with "Snap Photo", "Undo/Retake", and Fallback Connection
// Supports 4-digit badges (0001) that become 5-digit Trainee IDs (QNNNN)

const resultEl = document.getElementById('result');
const manualForm = document.getElementById('manual-form');
const manualInput = document.getElementById('manual-id');
const torchBtn = document.getElementById('torch');

// Snap & Undo elements
const snapBtn = document.getElementById('snap-btn');
const undoBtn = document.getElementById('undo-btn');
const snapshotContainer = document.getElementById('snapshot-container');
const snapshotCanvas = document.getElementById('snapshot-canvas');
const fileInput = document.getElementById('qr-file-input');
const scannerOverlay = document.getElementById('scanner-overlay');

// Quick registration modal elements
const regModal = document.getElementById('reg-modal');
const quickRegForm = document.getElementById('quick-reg-form');
const regBadgePreview = document.getElementById('reg-badge-preview');
const regQualSelect = document.getElementById('reg-qual');
const regNameInput = document.getElementById('reg-name');
const regIdPreview = document.getElementById('reg-id-preview');
const regCancelBtn = document.getElementById('reg-cancel');

const SAME_CODE_COOLDOWN_MS = 3000;
const REQUEST_TIMEOUT_MS = 12000;

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

      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data;
    } catch (err) {
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
    show('bad', 'Connection error: ' + (err.message || 'Please check network and try again.'));
  } finally {
    setTimeout(function () { busy = false; }, 1200);
  }
}

// ---------- Snap Photo & Undo Features ----------
function takeSnapshotFromVideo() {
  const video = document.querySelector('#reader video');
  if (!video) {
    show('bad', 'Camera is not ready yet. Please wait a moment.');
    return;
  }

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  snapshotCanvas.width = w;
  snapshotCanvas.height = h;

  const ctx = snapshotCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  // Display snapshot
  snapshotContainer.hidden = false;
  undoBtn.hidden = false;
  if (scannerOverlay) scannerOverlay.hidden = true;

  resultEl.className = '';
  resultEl.textContent = 'Processing photo snapshot…';

  // Convert canvas to blob and decode
  snapshotCanvas.toBlob(async function (blob) {
    if (!blob) {
      show('bad', 'Could not capture photo. Try again.');
      return;
    }

    try {
      const file = new File([blob], 'snapshot.png', { type: 'image/png' });
      const decodedText = await scanner.scanFile(file, true);
      const validId = normalizeId(decodedText);
      if (validId) {
        record(validId);
      } else {
        show('bad', 'Invalid QR code in photo: ' + decodedText);
      }
    } catch (decodeErr) {
      show('bad', 'Photo was blurry or no QR code was detected. Tap "Undo / Retake Photo" to try again.');
    }
  }, 'image/png');
}

function undoSnapshot() {
  snapshotContainer.hidden = true;
  undoBtn.hidden = true;
  if (scannerOverlay) scannerOverlay.hidden = false;
  resultEl.className = '';
  resultEl.textContent = 'Ready. Hold QR code in front of the camera.';
  busy = false;
}

snapBtn.addEventListener('click', takeSnapshotFromVideo);
undoBtn.addEventListener('click', undoSnapshot);

// Handle manual photo upload
fileInput.addEventListener('change', async function () {
  if (!fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];
  resultEl.className = '';
  resultEl.textContent = 'Processing uploaded photo…';
  undoBtn.hidden = false;

  try {
    const decodedText = await scanner.scanFile(file, true);
    const validId = normalizeId(decodedText);
    if (validId) {
      record(validId);
    } else {
      show('bad', 'Invalid QR code in photo: ' + decodedText);
    }
  } catch (err) {
    show('bad', 'Photo was blurry or no QR code found. Tap "Undo / Retake Photo" to retry.');
  } finally {
    fileInput.value = '';
  }
});

// ---------- On-the-fly Trainee Registration Modal ----------
function updateGeneratedIdPreview() {
  const qp = regQualSelect.value;
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
  if (busy || !regModal.hidden || !snapshotContainer.hidden) return;
  const now = Date.now();
  const id = normalizeId(text);

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
  const raw = manualInput.value.trim();
  const id = normalizeId(raw);
  manualInput.value = '';
  if (!id) {
    show('bad', 'Please enter a 4-digit badge (e.g. 0001) or 5-digit ID (e.g. 60001)');
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

  scanner = scanner || new Html5Qrcode('reader', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });

  const baseConfig = {
    fps: 24,
    disableFlip: true,
    qrbox: function (w, h) {
      const edge = Math.floor(Math.min(w, h) * 0.8);
      return { width: edge, height: edge };
    }
  };

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
    resultEl.textContent = 'Hold QR code steady or tap "Snap Photo of QR".';
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || /permission/i.test(String(err)));
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
  else if (snapshotContainer.hidden) startScanner();
});

startScanner();