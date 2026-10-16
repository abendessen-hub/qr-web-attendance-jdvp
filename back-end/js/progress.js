// Progress Dashboard Controller
// Dynamic calculations across all 6 JDVP qualification sheets

const $ = function (id) { return document.getElementById(id); };

let currentRecords = [];
let summary = null;
let currentPage = 1;
let totalPages = 1;
let searchTimer = null;
let loadRequestId = 0;
const PAGE_SIZE = 50;

const ALL_QUAL_LIST = [
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

// ─── Fetch a page of records and the all-time dashboard summaries ───
async function loadAllData(page = currentPage) {
  const requestId = ++loadRequestId;
  await configReady;
  if (requestId !== loadRequestId) return;
  if (!apiReady()) {
    $('table-message').textContent = 'API URL is not configured yet.';
    return;
  }

  $('table-message').textContent = 'Loading records from Google Sheets…';
  $('date-chart').innerHTML = '<div class="chart-loading">Loading chart…</div>';
  $('qual-chart').innerHTML = '<div class="chart-loading">Loading statistics…</div>';
  try {
    if (!CONFIG.IS_ADMIN) {
      const assignedName = QUALIFICATIONS[CONFIG.QUALIFICATION];
      $('filter-qual').value = assignedName;
      $('filter-qual').disabled = true;
      for (const option of $('filter-qual').options) {
        if (option.value && option.value !== assignedName) option.hidden = true;
      }
    }

    const params = new URLSearchParams({
      action: 'records',
      page: String(page),
      pageSize: String(PAGE_SIZE)
    });
    const date = $('filter-date').value;
    const qualification = $('filter-qual').value;
    const search = $('search-student').value.trim();
    if (date) params.set('date', date);
    if (qualification) params.set('filterQualification', qualification);
    if (search) params.set('search', search);

    const res = await fetch(CONFIG.API_URL + '?' + params.toString());
    if (requestId !== loadRequestId) return;
    if (!res.ok) throw new Error('Attendance API returned HTTP ' + res.status + '.');
    const data = await res.json();
    if (requestId !== loadRequestId) return;
    if (data.status !== 'ok') throw new Error(data.message || 'Could not load attendance records.');
    if (!data.pagination || !data.summary) {
      throw new Error('Attendance API does not support paginated records yet. Redeploy the latest Apps Script.');
    }

    currentRecords = data.records || [];
    summary = data.summary;
    currentPage = data.pagination.page;
    totalPages = Math.max(data.pagination.totalPages, 1);

    renderSummaryCards(summary);
    renderDailyHistoryAndChart(summary.dateCounts);
    renderQualificationProgress(summary.qualificationCounts);
    renderFilteredTable(data.pagination);
  } catch (err) {
    if (requestId !== loadRequestId) return;
    $('table-message').textContent = err.message || 'Failed to load records from Google Sheets. Check connection and click Refresh.';
    console.error('Error loading progress data:', err);
  }
}

// ─── Summary Stat Cards ───
function renderSummaryCards(data) {
  $('stat-total-students').textContent = data.totalTrainees;
  $('stat-today-attendance').textContent = data.todayAttendance;
  $('stat-total-records').textContent = data.totalRecords;
}

// ─── Daily History Table & Bar Chart ───
function renderDailyHistoryAndChart(dateCounts) {
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

  dates.forEach(function (d, idx) {
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
    barFill.style.width = '0%'; // Start collapsed for smooth animation

    const countSpan = document.createElement('div');
    countSpan.className = 'chart-count';
    countSpan.innerHTML = count + ' <span class="unit">(' + pct + '%)</span>';

    barWrap.appendChild(barFill);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countSpan);

    chartContainer.appendChild(row);

    // Smooth staggered bar grow animation
    setTimeout(function () {
      barFill.style.width = Math.max(pct, 4) + '%';
    }, 40 + idx * 35);
  });
}

// ─── Qualification Progress Chart ───
function renderQualificationProgress(qualCounts) {
  const qualifications = CONFIG.IS_ADMIN
    ? ALL_QUAL_LIST.slice()
    : [QUALIFICATIONS[CONFIG.QUALIFICATION]];
  Object.keys(qualCounts).forEach(function (qualification) {
    if (CONFIG.IS_ADMIN && !qualifications.includes(qualification)) {
      qualifications.push(qualification);
    }
  });

  const chartContainer = $('qual-chart');
  chartContainer.replaceChildren();

  const maxQual = Math.max(...Object.values(qualCounts), 1);

  qualifications.forEach(function (q, idx) {
    const count = qualCounts[q] || 0;
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
    barFill.style.width = '0%'; // Start collapsed for smooth animation

    const countSpan = document.createElement('div');
    countSpan.className = 'chart-count';
    countSpan.innerHTML = count + ' <span class="unit">' + (count === 1 ? 'trainee' : 'trainees') + '</span>';

    barWrap.appendChild(barFill);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countSpan);

    chartContainer.appendChild(row);

    // Smooth staggered bar grow animation
    setTimeout(function () {
      barFill.style.width = count === 0 ? '0%' : Math.max(pct, 4) + '%';
    }, 40 + idx * 35);
  });
}

// ─── Daily Student History & Filtering Table ───
function renderFilteredTable(pagination) {
  const today = getTodayIso();
  const body = $('records-body');
  body.replaceChildren();

  currentRecords.forEach(function (r) {
    const tr = document.createElement('tr');
    
    const tdId = document.createElement('td');
    tdId.innerHTML = '<span class="id-badge">' + (r.id || '—') + '</span>';

    const tdName = document.createElement('td');
    tdName.textContent = r.name || '—';

    const tdQual = document.createElement('td');
    const qualBadge = document.createElement('span');
    qualBadge.className = 'badge-qual';
    qualBadge.textContent = r.qualification || '—';
    tdQual.appendChild(qualBadge);

    const tdDate = document.createElement('td');
    tdDate.textContent = r.date || '—';

    const tdIn = document.createElement('td');
    tdIn.textContent = r.timeIn || '—';

    const tdOut = document.createElement('td');
    if (r.timeOut) {
      tdOut.innerHTML = '<span class="tag-done">' + r.timeOut + '</span>';
    } else {
      if (r.date && r.date < today) {
        tdOut.innerHTML = '<span class="tag-failed">Failed</span>';
      } else {
        tdOut.innerHTML = '<span class="tag-pending">Pending</span>';
      }
    }

    tr.append(tdId, tdName, tdQual, tdDate, tdIn, tdOut);
    body.appendChild(tr);
  });

  const firstRecord = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastRecord = Math.min(pagination.page * pagination.pageSize, pagination.total);
  $('count-shown').textContent = firstRecord + '–' + lastRecord;
  $('count-filtered').textContent = pagination.total;
  $('count-total').textContent = summary.totalRecords;
  $('page-label').textContent = 'Page ' + pagination.page + ' of ' + Math.max(pagination.totalPages, 1);
  $('prev-page').disabled = pagination.page <= 1;
  $('next-page').disabled = pagination.page >= pagination.totalPages;

  if (currentRecords.length > 0) {
    $('table-message').textContent = '';
  } else if (summary.totalRecords > 0 || $('search-student').value.trim()) {
    $('table-message').textContent = 'No records match your selected filters. Try clearing filters.';
  } else {
    $('table-message').textContent = 'No attendance recorded in the system yet.';
  }
}

// ─── Event Listeners ───
$('filter-date').addEventListener('input', function () { loadAllData(1); });
$('filter-qual').addEventListener('change', function () { loadAllData(1); });
$('search-student').addEventListener('input', function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () { loadAllData(1); }, 250);
});
$('btn-refresh').addEventListener('click', function () { loadAllData(currentPage); });
$('prev-page').addEventListener('click', function () {
  if (currentPage > 1) loadAllData(currentPage - 1);
});
$('next-page').addEventListener('click', function () {
  if (currentPage < totalPages) loadAllData(currentPage + 1);
});

$('btn-clear').addEventListener('click', function () {
  clearTimeout(searchTimer);
  $('filter-date').value = '';
  $('filter-qual').value = '';
  $('search-student').value = '';
  loadAllData(1);
});

// Initial load
loadAllData();
