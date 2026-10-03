// Uses qrcodejs (davidshimjs) and JSZip.
const SIZE = 300, MARGIN = 30;
const holder = document.createElement('div');
const qr = new QRCode(holder, { width: SIZE, height: SIZE, correctLevel: QRCode.CorrectLevel.M });

const $ = function (id) { return document.getElementById(id); };
let singleUrl = '';
let batch = [];            // [{ id, url }]

// Returns a PNG data URL: the QR code on white with a quiet zone around it.
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

// One student
$('single-make').addEventListener('click', function () {
  const id = normalizeId($('single-id').value);
  if (!id) { $('single-preview').textContent = 'Enter an ID from 0001 to ' + String(CONFIG.MAX_ID).padStart(4, '0') + '.'; return; }
  singleUrl = makePng(id);
  const img = new Image();
  img.src = singleUrl; img.alt = 'QR code for ' + id; img.width = 240;
  $('single-preview').replaceChildren(img);
  $('single-download').disabled = false;
  $('single-download').dataset.id = id;
});
$('single-download').addEventListener('click', function () {
  save(singleUrl, $('single-download').dataset.id + '.png');
});

// Range
$('range-make').addEventListener('click', function () {
  const from = normalizeId($('range-from').value), to = normalizeId($('range-to').value);
  if (!from || !to || +from > +to) { $('range-status').textContent = 'Enter a valid range, for example 0001 to 0400.'; return; }

  batch = [];
  $('grid').replaceChildren();
  $('range-zip').disabled = $('range-print').disabled = true;
  $('range-make').disabled = true;
  $('progress').style.display = 'block';

  const total = +to - +from + 1;
  let n = +from;
  (function step() {
    const stop = Math.min(n + 20, +to + 1);           // 20 codes per slice keeps the page responsive
    for (; n < stop; n++) {
      const id = String(n).padStart(4, '0');
      const url = makePng(id);
      batch.push({ id: id, url: url });
      const card = document.createElement('div'); card.className = 'qr-card';
      const img = new Image(); img.src = url; img.alt = 'QR code for ' + id;
      const label = document.createElement('span'); label.textContent = id;
      card.append(img, label);
      $('grid').appendChild(card);
    }
    $('progress').firstElementChild.style.width = (batch.length / total * 100) + '%';
    $('range-status').textContent = batch.length + ' of ' + total + ' generated';
    if (n <= +to) { setTimeout(step, 0); return; }
    $('range-make').disabled = false;
    $('range-zip').disabled = $('range-print').disabled = false;
    $('range-status').textContent = total + ' QR codes ready. Download the ZIP or print the sheet.';
    setTimeout(function () { $('progress').style.display = 'none'; }, 800);
  })();
});

$('range-zip').addEventListener('click', async function () {
  const zip = new JSZip();
  batch.forEach(function (item) { zip.file(item.id + '.png', item.url.split(',')[1], { base64: true }); });
  $('range-status').textContent = 'Building ZIP…';
  const blob = await zip.generateAsync({ type: 'blob' });
  const href = URL.createObjectURL(blob);
  save(href, 'jdvp-qr-codes.zip');
  setTimeout(function () { URL.revokeObjectURL(href); }, 5000);
  $('range-status').textContent = 'ZIP downloaded.';
});

$('range-print').addEventListener('click', function () { window.print(); });