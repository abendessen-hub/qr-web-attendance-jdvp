const $ = function (id) { return document.getElementById(id); };
let all = [];

function render() {
  const q = $('search-id').value.trim();
  const d = $('filter-date').value;
  const rows = all.filter(function (r) {
    return (!q || r.id.indexOf(q) !== -1) && (!d || r.date === d);
  });

  const body = $('rows');
  body.replaceChildren();
  rows.forEach(function (r) {
    const tr = document.createElement('tr');
    [r.id, r.date, r.time].forEach(function (v) {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    body.appendChild(tr);
  });

  $('count-shown').textContent = rows.length;
  $('count-total').textContent = all.length;
  $('message').textContent = rows.length ? '' : (all.length ? 'No records match. Clear the filters to see all.' : 'No attendance recorded yet.');
}

async function load() {
  if (!apiReady()) { $('message').textContent = 'Set API_URL in js/config.js first.'; return; }
  $('message').textContent = 'Loading records…';
  try {
    const res = await fetch(CONFIG.API_URL);
    const data = await res.json();
    all = (data.records || []).slice().reverse();      // newest first
    render();
  } catch (err) {
    $('message').textContent = 'Could not load records. Check your connection and press Refresh.';
  }
}

$('search-id').addEventListener('input', render);
$('filter-date').addEventListener('input', render);
$('refresh').addEventListener('click', load);
$('clear').addEventListener('click', function () {
  $('search-id').value = ''; $('filter-date').value = ''; render();
});
load();