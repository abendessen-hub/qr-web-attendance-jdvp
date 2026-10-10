// QR Generator: qualification-bound trainee IDs with batch ZIP export and A4 printing
// Uses qrcodejs and JSZip

const SIZE = 300, MARGIN = 30;
const holder = document.createElement('div');
const qr = new QRCode(holder, { width: SIZE, height: SIZE, correctLevel: QRCode.CorrectLevel.M });

const $ = function (id) { return document.getElementById(id); };
let singleUrl = '';
let batch = []; // [{ id, url }]

function buildTraineeId(qualification, badgeId) {
  return qualification + badgeId;
}

// Returns a PNG data URL: high-contrast QR code on white canvas with quiet zone
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

// ─── One student (4 digits) ───
$('single-make').addEventListener('click', function () {
  const badgeId = normalizeId($('single-id').value);
  const qualification = $('single-qualification').value;
  if (!badgeId || !QUALIFICATIONS[qualification]) {
    $('single-preview').textContent = 'Enter a valid badge ID and select a qualification.';
    $('single-download').disabled = true;
    singleUrl = '';
    return;
  }
  const id = buildTraineeId(qualification, badgeId);
  singleUrl = makePng(id);
  const img = new Image();
  img.src = singleUrl; img.alt = 'QR code for ' + id; img.width = 240;

  const card = document.createElement('div');
  card.className = 'qr-card';
  const label = document.createElement('span'); label.textContent = id;
  const note = document.createElement('small'); note.textContent = QUALIFICATIONS[qualification];
  card.append(img, label, note);

  $('single-preview').replaceChildren(card);
  $('single-download').disabled = false;
  $('single-download').dataset.id = id;
});

$('single-download').addEventListener('click', function () {
  save(singleUrl, $('single-download').dataset.id + '.png');
});

// ─── A range of students (0001 to 0400) ───
$('range-make').addEventListener('click', function () {
  const from = normalizeId($('range-from').value);
  const to = normalizeId($('range-to').value);
  const qualification = $('range-qualification').value;

  batch = [];
  $('grid').replaceChildren();
  $('range-zip').disabled = $('range-print').disabled = true;
  if (!from || !to || +from > +to || !QUALIFICATIONS[qualification]) {
    $('range-status').textContent = 'Select a qualification and enter a valid range, for example 0001 to 0400.';
    return;
  }

  $('range-make').disabled = true;
  $('progress').style.display = 'block';

  const total = +to - +from + 1;
  let n = +from;

  (function step() {
    const stop = Math.min(n + 20, +to + 1); // 20 codes per slice keeps browser smooth
    for (; n < stop; n++) {
      const badgeId = String(n).padStart(4, '0');
      const id = buildTraineeId(qualification, badgeId);
      const url = makePng(id);
      batch.push({ id: id, url: url });

      const card = document.createElement('div');
      card.className = 'qr-card';
      const img = new Image(); img.src = url; img.alt = 'QR code for ' + id;
      const label = document.createElement('span'); label.textContent = id;
      const note = document.createElement('small'); note.textContent = QUALIFICATIONS[qualification];
      card.append(img, label, note);
      $('grid').appendChild(card);
    }

    $('progress').firstElementChild.style.width = (batch.length / total * 100) + '%';
    $('range-status').textContent = batch.length + ' of ' + total + ' generated';

    if (n <= +to) {
      setTimeout(step, 0);
      return;
    }

    $('range-make').disabled = false;
    $('range-zip').disabled = $('range-print').disabled = false;
    $('range-status').textContent = total + ' ' + QUALIFICATIONS[qualification] + ' QR codes ready. Download the ZIP or print the sheet.';
    setTimeout(function () { $('progress').style.display = 'none'; }, 800);
  })();
});

// ─── Download ZIP ───
$('range-zip').addEventListener('click', async function () {
  const zip = new JSZip();
  batch.forEach(function (item) {
    zip.file(item.id + '.png', item.url.split(',')[1], { base64: true });
  });
  $('range-status').textContent = 'Building ZIP…';
  const blob = await zip.generateAsync({ type: 'blob' });
  const href = URL.createObjectURL(blob);
  save(href, 'jdvp-qr-codes-' + batch[0].id + '-to-' + batch[batch.length - 1].id + '.zip');
  setTimeout(function () { URL.revokeObjectURL(href); }, 5000);
  $('range-status').textContent = 'ZIP downloaded.';
});

// ─── Print A4 Sheet ───
$('range-print').addEventListener('click', function () {
  window.print();
});