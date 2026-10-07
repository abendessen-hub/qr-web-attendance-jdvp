// Progress Dashboard Controller
// Dynamic calculations across all 6 JDVP qualification sheets

const $ = function (id) { return document.getElementById(id); };

let allRecords = [];
let allTrainees = [];

const QUAL_LIST = [
  'Cookery',
  'House Keeping',
  'CSS',
  'EIM',
  'SMAW NC I',
  'SMAW NC II'
];

function formatDateDisplay(isoDateStr) {
  if (!isoDateStr) return '—';
  // If format is YYYY-MM-DD
  const parts = isoDateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  }
  return isoDateStr;
}

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ─── Fetch All Data from Backend ───
async function loadAllData() {
  await configReady;
  if (!apiReady()) {
    $('table-message').textContent = 'API URL is not configured yet.';
    return;
  }

  $('table-message').textContent = 'Loading records from Google Sheets…';
  $('date-chart').innerHTML = '<div class="chart-loading">Loading chart…</div>';
  $('qual-chart').innerHTML = '<div class="chart-loading">Loading statistics…</div>';

  try {
    // 1. Fetch attendance records
    const res = await fetch(CONFIG.API_URL);
    const data = await res.json();
    allRecords = (data.records || []).slice().reverse(); // newest first

    // 2. Fetch master trainee registry
    try {
      const regRes = await fetch(CONFIG.API_URL + '?action=registry');
      const regData = await regRes.json();
      allTrainees = regData.trainees || [];
    } catch (_) {
      allTrainees = [];
    }

    renderSummaryCards();
    renderDailyHistoryAndChart();
    renderQualificationProgress();
    renderFilteredTable();
  } catch (err) {
    $('table-message').textContent = 'Failed to load records from Google Sheets. Check connection and click Refresh.';
    console.error('Error loading progress data:', err);
  }
}

// ─── Summary Stat Cards ───
function renderSummaryCards() {
  const today = getTodayIso();
  const todayLogs = allRecords.filter(function (r) { return r.date === today; });

  // If registry was fetched, use its count, else calculate unique IDs from records
  const totalStudents = allTrainees.length > 0 
    ? allTrainees.length 
    : new Set(allRecords.map(function (r) { return r.id; })).size;

  $('stat-total-students').textContent = totalStudents;
  $('stat-today-attendance').textContent = todayLogs.length;
  $('stat-total-records').textContent = allRecords.length;
}

// ─── Daily History Table & Bar Chart ───
function renderDailyHistoryAndChart() {
  // Aggregate records by date
  const dateCounts = {}; // { '2026-10-08': count }
  allRecords.forEach(function (r) {
    if (!r.date) return;
    dateCounts[r.date] = (dateCounts[r.date] || 0) + 1;
  });

  // Sort dates chronologically
  const dates = Object.keys(dateCounts).sort();

  // Render Table
  const historyBody = $('history-rows');
  historyBody.replaceChildren();

  if (dates.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2; td.className = 'table-empty';
    td.textContent = 'No attendance recorded yet.';
    tr.appendChild(td);
    historyBody.appendChild(tr);
  } else {
    // Display newest date at top of table
    dates.slice().reverse().forEach(function (d) {
      const tr = document.createElement('tr');
      const tdDate = document.createElement('td');
      tdDate.textContent = formatDateDisplay(d);
      const tdCount = document.createElement('td');
      tdCount.innerHTML = '<strong>' + dateCounts[d] + '</strong> students';
      tr.appendChild(tdDate);
      tr.appendChild(tdCount);
      historyBody.appendChild(tr);
    });
  }

  // Render Visual Bar Chart
  const chartContainer = $('date-chart');
  chartContainer.replaceChildren();

  if (dates.length === 0) {
    chartContainer.innerHTML = '<div class="table-empty">No daily data available for chart.</div>';
    return;
  }

  const maxDaily = Math.max(...Object.values(dateCounts), 1);

  dates.forEach(function (d) {
    const count = dateCounts[d];
    const pct = Math.round((count / maxDaily) * 100);

    const row = document.createElement('div');
    row.className = 'chart-row';

    const label = document.createElement('div');
    label.className = 'chart-label';
    label.textContent = formatDateDisplay(d);

    const barWrap = document.createElement('div');
    barWrap.className = 'chart-bar-wrap';

    const barFill = document.createElement('div');
    barFill.className = 'chart-bar-fill';
    barFill.style.width = Math.max(pct, 4) + '%';

    const countSpan = document.createElement('div');
    countSpan.className = 'chart-count';
    countSpan.textContent = count;

    barWrap.appendChild(barFill);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countSpan);

    chartContainer.appendChild(row);
  });
}

// ─── Qualification Progress Chart ───
function renderQualificationProgress() {
  const qualCounts = {};
  QUAL_LIST.forEach(function (q) { qualCounts[q] = 0; });

  // Count unique trainees per qualification from records
  const qualStudents = {};
  QUAL_LIST.forEach(function (q) { qualStudents[q] = new Set(); });

  allRecords.forEach(function (r) {
    if (r.qualification && qualStudents[r.qualification]) {
      qualStudents[r.qualification].add(r.id);
    }
  });

  QUAL_LIST.forEach(function (q) {
    qualCounts[q] = qualStudents[q].size;
  });

  const chartContainer = $('qual-chart');
  chartContainer.replaceChildren();

  const maxQual = Math.max(...Object.values(qualCounts), 1);

  QUAL_LIST.forEach(function (q) {
    const count = qualCounts[q];
    const pct = Math.round((count / maxQual) * 100);

    const row = document.createElement('div');
    row.className = 'chart-row';

    const label = document.createElement('div');
    label.className = 'chart-label';
    label.textContent = q;

    const barWrap = document.createElement('div');
    barWrap.className = 'chart-bar-wrap';

    const barFill = document.createElement('div');
    barFill.className = 'chart-bar-fill';
    barFill.style.width = count === 0 ? '0%' : Math.max(pct, 4) + '%';

    const countSpan = document.createElement('div');
    countSpan.className = 'chart-count';
    countSpan.textContent = count + ' students';

    barWrap.appendChild(barFill);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countSpan);

    chartContainer.appendChild(row);
  });
}

// ─── Daily Student History & Filtering Table ───
function renderFilteredTable() {
  const targetDate = $('filter-date').value;
  const targetQual = $('filter-qual').value;
  const search = $('search-student').value.trim().toLowerCase();

  const filtered = allRecords.filter(function (r) {
    const matchDate = !targetDate || r.date === targetDate;
    const matchQual = !targetQual || r.qualification === targetQual;
    const matchSearch = !search || 
      (r.id && r.id.toLowerCase().indexOf(search) !== -1) ||
      (r.name && r.name.toLowerCase().indexOf(search) !== -1);

    return matchDate && matchQual && matchSearch;
  });

  const body = $('records-body');
  body.replaceChildren();

  filtered.forEach(function (r) {
    const tr = document.createElement('tr');
    
    const tdId = document.createElement('td');
    tdId.innerHTML = '<strong>' + (r.id || '—') + '</strong>';

    const tdName = document.createElement('td');
    tdName.textContent = r.name || '—';

    const tdQual = document.createElement('td');
    tdQual.textContent = r.qualification || '—';

    const tdDate = document.createElement('td');
    tdDate.textContent = r.date || '—';

    const tdIn = document.createElement('td');
    tdIn.textContent = r.timeIn || '—';

    const tdOut = document.createElement('td');
    tdOut.textContent = r.timeOut || '—';
    if (!r.timeOut) {
      tdOut.className = 'text-muted';
      tdOut.textContent = 'Pending';
    }

    tr.append(tdId, tdName, tdQual, tdDate, tdIn, tdOut);
    body.appendChild(tr);
  });

  $('count-shown').textContent = filtered.length;
  $('count-total').textContent = allRecords.length;

  if (filtered.length > 0) {
    $('table-message').textContent = '';
  } else if (allRecords.length > 0) {
    $('table-message').textContent = 'No records match your selected filters. Try clearing filters.';
  } else {
    $('table-message').textContent = 'No attendance recorded in the system yet.';
  }
}

// ─── Event Listeners ───
$('filter-date').addEventListener('input', renderFilteredTable);
$('filter-qual').addEventListener('change', renderFilteredTable);
$('search-student').addEventListener('input', renderFilteredTable);
$('btn-refresh').addEventListener('click', loadAllData);

$('btn-clear').addEventListener('click', function () {
  $('filter-date').value = '';
  $('filter-qual').value = '';
  $('search-student').value = '';
  renderFilteredTable();
});

// Initial load
loadAllData();
