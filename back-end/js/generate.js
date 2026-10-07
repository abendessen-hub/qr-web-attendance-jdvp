// Generate & Registration logic
// Depends on: CONFIG, configReady, apiReady(), normalizeId(), QUALIFICATIONS, QRCode

const SIZE = 300, MARGIN = 30;
const holder = document.createElement('div');
const qr = new QRCode(holder, { width: SIZE, height: SIZE, correctLevel: QRCode.CorrectLevel.M });

const $ = function (id) { return document.getElementById(id); };
let lastPngUrl = '';
let allTrainees = [];

// ─── QR PNG helper ───
function makePng(id) {
  qr.makeCode(id);
  const src = holder.querySelector('canvas');
  const out = document.createElement('canvas');
  out.width = out.height = SIZE + MARGIN * 2;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, MARGIN, MARGIN, SIZE, SIZE);
  return out.toDataURL('image/png');
}

function save(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

// ─── Fetch the next available ID when qualification changes ───
async function refreshNextId() {
  await configReady;
  if (!apiReady()) return;
  const qp = $('gen-qual').value;
  $('gen-id').value = 'Loading…';
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'getNextId', qualification: qp })
    });
    const data = await res.json();
    $('gen-id').value = data.id || '—';
  } catch (err) {
    $('gen-id').value = 'Error';
  }
}

$('gen-qual').addEventListener('change', refreshNextId);
configReady.then(refreshNextId);

// ─── Register & Generate ───
$('gen-submit').addEventListener('click', async function () {
  const name = $('gen-name').value.trim();
  const qp   = $('gen-qual').value;
  if (!name) { $('gen-status').textContent = 'Please enter the trainee\'s full name.'; return; }

  await configReady;
  if (!apiReady()) { $('gen-status').textContent = 'API URL is not configured yet.'; return; }

  $('gen-submit').disabled = true;
  $('gen-status').textContent = 'Registering…';

  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'register', name: name, qualification: qp })
    });
    const data = await res.json();

    if (data.status !== 'ok') {
      $('gen-status').textContent = data.message || 'Registration failed.';
      return;
    }

    // Render QR badge
    lastPngUrl = makePng(data.id);
    const preview = $('gen-preview');
    preview.replaceChildren();

    const card = document.createElement('div');
    card.className = 'qr-card';
    const img = new Image(); img.src = lastPngUrl; img.alt = 'QR for ' + data.id; img.width = 240;
    const label = document.createElement('span'); label.textContent = data.id;
    const nameEl = document.createElement('small'); nameEl.textContent = data.name;
    const qualEl = document.createElement('small'); qualEl.textContent = data.qualification;
    card.append(img, label, nameEl, qualEl);
    preview.appendChild(card);

    $('gen-download').disabled = false;
    $('gen-download').dataset.id = data.id;
    $('gen-name').value = '';
    $('gen-status').textContent = 'Registered: ' + data.name + ' → ' + data.id;

    refreshNextId();
  } catch (err) {
    $('gen-status').textContent = 'Network error. Try again.';
  } finally {
    $('gen-submit').disabled = false;
  }
});

$('gen-download').addEventListener('click', function () {
  save(lastPngUrl, $('gen-download').dataset.id + '.png');
});

// ─── Load registered trainees ───
async function loadTrainees() {
  await configReady;
  if (!apiReady()) { $('trainees-msg').textContent = 'API URL not configured.'; return; }

  $('trainees-msg').textContent = 'Loading…';
  try {
    const res = await fetch(CONFIG.API_URL + '?action=registry');
    const data = await res.json();
    allTrainees = data.trainees || [];
    renderTrainees();
  } catch (err) {
    $('trainees-msg').textContent = 'Could not load trainees.';
  }
}

function renderTrainees() {
  const filter = $('list-qual').value;
  const list = allTrainees.filter(function (t) {
    return !filter || t.qualification === filter;
  });

  const body = $('trainees-body');
  body.replaceChildren();
  list.forEach(function (t) {
    const tr = document.createElement('tr');
    [t.id, t.name, t.qualification].forEach(function (v) {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn ghost'; btn.textContent = 'QR';
    btn.addEventListener('click', function () {
      lastPngUrl = makePng(t.id);
      const preview = $('gen-preview');
      preview.replaceChildren();
      const card = document.createElement('div'); card.className = 'qr-card';
      const img = new Image(); img.src = lastPngUrl; img.alt = 'QR for ' + t.id; img.width = 240;
      const label = document.createElement('span'); label.textContent = t.id;
      const nameEl = document.createElement('small'); nameEl.textContent = t.name;
      card.append(img, label, nameEl);
      preview.appendChild(card);
      $('gen-download').disabled = false;
      $('gen-download').dataset.id = t.id;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    td.appendChild(btn);
    tr.appendChild(td);
    body.appendChild(tr);
  });

  $('trainees-msg').textContent = list.length ? '' : 'No trainees found.';
  $('print-badges').disabled = list.length === 0;
}

$('load-trainees').addEventListener('click', loadTrainees);
$('list-qual').addEventListener('change', renderTrainees);

// ─── Print all badges for the filtered qualification ───
$('print-badges').addEventListener('click', function () {
  const filter = $('list-qual').value;
  const list = allTrainees.filter(function (t) { return !filter || t.qualification === filter; });

  const grid = $('grid');
  grid.replaceChildren();

  list.forEach(function (t) {
    const url = makePng(t.id);
    const card = document.createElement('div'); card.className = 'qr-card';
    const img = new Image(); img.src = url; img.alt = 'QR for ' + t.id;
    const label = document.createElement('span'); label.textContent = t.id;
    const nameEl = document.createElement('small'); nameEl.textContent = t.name;
    card.append(img, label, nameEl);
    grid.appendChild(card);
  });

  setTimeout(function () { window.print(); }, 300);
});