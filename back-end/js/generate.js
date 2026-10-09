// QR Generator: 4-digit badge generator with batch ZIP export and A4 printing
// Uses qrcodejs and JSZip

const SIZE = 300, MARGIN = 30, QR_TOP = 65;
const holder = document.createElement('div');
const qr = new QRCode(holder, { width: SIZE, height: SIZE, correctLevel: QRCode.CorrectLevel.M });

const $ = function (id) { return document.getElementById(id); };
let singleUrl = '';
let batch = []; // [{ id, url }]

function selectedQualification() {
  const qualification = $('qualification-select').value;
  if (!QUALIFICATIONS[qualification]) return null;
  if (!CONFIG.IS_ADMIN && qualification !== CONFIG.QUALIFICATION) return null;
  return qualification;
}

// Returns a PNG data URL with the QR code and its badge labels.
function makePng(id, qualification) {
  qr.makeCode(id);
  const src = holder.querySelector('canvas');
  const out = document.createElement('canvas');
  out.width = SIZE + MARGIN * 2;
  out.height = 470;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('JDVP Trainee', out.width / 2, 38);
  ctx.drawImage(src, MARGIN, QR_TOP, SIZE, SIZE);
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText(id, out.width / 2, 405);
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText(QUALIFICATIONS[qualification], out.width / 2, 435);
  return out.toDataURL('image/png');
}

function save(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

// ─── One student (4 digits) ───
$('single-make').addEventListener('click', function () {
  const qualification = selectedQualification();
  if (!qualification) {
    $('single-preview').textContent = 'Select an available qualification first.';
    return;
  }
  const id = normalizeId($('single-id').value);
  if (!id) {
    $('single-preview').textContent = 'Enter an ID from 0001 to 0400.';
    return;
  }
  singleUrl = makePng(id, qualification);
  const img = new Image();
  img.src = singleUrl; img.alt = 'JDVP Trainee badge for ' + QUALIFICATIONS[qualification] + ', ID ' + id; img.width = 220;

  const card = document.createElement('div');
  card.className = 'qr-card';
  card.append(img);

  $('single-preview').replaceChildren(card);
  $('single-download').disabled = false;
  $('single-download').dataset.id = id;
});

$('single-download').addEventListener('click', function () {
  save(singleUrl, $('single-download').dataset.id + '.png');
});

// ─── A range of students (0001 to 0400) ───
$('range-make').addEventListener('click', function () {
  const qualification = selectedQualification();
  if (!qualification) {
    $('range-status').textContent = 'Select an available qualification first.';
    return;
  }
  const from = normalizeId($('range-from').value);
  const to = normalizeId($('range-to').value);

  if (!from || !to || +from > +to) {
    $('range-status').textContent = 'Enter a valid range, for example 0001 to 0400.';
    return;
  }

  batch = [];
  $('grid').replaceChildren();
  $('range-zip').disabled = $('range-print').disabled = true;
  $('range-make').disabled = true;
  $('progress').style.display = 'block';

  const total = +to - +from + 1;
  let n = +from;

  (function step() {
    const stop = Math.min(n + 20, +to + 1); // 20 codes per slice keeps browser smooth
    for (; n < stop; n++) {
      const id = String(n).padStart(4, '0');
      const url = makePng(id, qualification);
      batch.push({ id: id, url: url });

      const card = document.createElement('div');
      card.className = 'qr-card';
      const img = new Image(); img.src = url; img.alt = 'JDVP Trainee badge for ' + QUALIFICATIONS[qualification] + ', ID ' + id;
      card.append(img);
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
    $('range-status').textContent = total + ' QR codes ready. Download the ZIP or print the sheet.';
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
  save(href, 'jdvp-qr-codes-' + $('qualification-select').value + '-' + batch[0].id + '-to-' + batch[batch.length - 1].id + '.zip');
  setTimeout(function () { URL.revokeObjectURL(href); }, 5000);
  $('range-status').textContent = 'ZIP downloaded.';
});

// ─── Print A4 Sheet ───
$('range-print').addEventListener('click', function () {
  window.print();
});

configReady.then(function () {
  const select = $('qualification-select');
  if (CONFIG.IS_ADMIN) {
    select.disabled = false;
  } else {
    for (const option of select.options) {
      if (option.value && option.value !== CONFIG.QUALIFICATION) option.hidden = true;
    }
    select.value = CONFIG.QUALIFICATION;
  }
  select.disabled = !CONFIG.IS_ADMIN;
}).catch(function () {
  $('single-preview').textContent = 'Could not verify account access. Reload the page and sign in again.';
  $('range-status').textContent = 'Could not verify account access. Reload the page and sign in again.';
});

$('qualification-select').addEventListener('change', function () {
  singleUrl = '';
  batch = [];
  $('single-preview').replaceChildren();
  $('single-download').disabled = true;
  $('grid').replaceChildren();
  $('range-zip').disabled = $('range-print').disabled = true;
  $('range-status').textContent = 'Qualification changed. Generate badges to continue.';
});