const resultEl = document.getElementById('result');
const manualForm = document.getElementById('manual-form');
const manualInput = document.getElementById('manual-id');

let busy = false;
let lastId = '';
let lastAt = 0;

function show(kind, message) {
  resultEl.className = kind;
  resultEl.textContent = message;
  if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 120 : [80, 60, 80]);
}

async function record(raw) {
  const id = normalizeId(raw);
  if (!id) { show('bad', 'Invalid QR code'); return; }
  if (busy) return;
  if (id === lastId && Date.now() - lastAt < 4000) return;   // same code still in front of the camera

  await configReady;
  if (!apiReady()) {
    alert('API URL is not configured yet.');
    return;
  }

  busy = true; lastId = id; lastAt = Date.now();
  resultEl.className = ''; resultEl.textContent = 'Checking ' + id + '…';
  try {
    const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ id: id }) });
    const data = await res.json();
    if (data.status === 'ok') show('ok', id + ' recorded at ' + data.time);
    else if (data.status === 'duplicate') show('dup', id + ' already recorded today');
    else if (data.status === 'invalid') show('bad', 'Invalid QR code');
    else show('bad', 'Could not record. Scan again.');
  } catch (err) {
    lastId = '';
    show('bad', 'No connection. Scan again.');
  }
  setTimeout(function () { busy = false; }, 1200);
}

manualForm.addEventListener('submit', function (e) {
  e.preventDefault();
  record(manualInput.value);
  manualInput.value = '';
});

const scanner = new Html5Qrcode('reader');
scanner.start(
  { facingMode: 'environment' },
  { fps: 10, qrbox: { width: 240, height: 240 } },
  function (text) { record(text); },
  function () { /* no code in frame */ }
).then(function () {
  resultEl.textContent = 'Ready. Hold a QR code in front of the camera.';
}).catch(function () {
  show('bad', 'Camera unavailable. Allow camera access or use manual entry.');
});