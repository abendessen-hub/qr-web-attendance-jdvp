// Progress Dashboard Controller
// Dynamic calculations across all 6 JDVP qualification sheets

const $ = function (id) { return document.getElementById(id); };

let currentRecords = [];
let summary = null;
let currentPage = 1;
let totalPages = 1;
let searchTimer = null;
let loadRequestId = 0;
let masterRoster = [];
let currentStatusFilter = 'all'; // 'all', 'present', 'no-timeout'

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 100;

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

function getQrCode(id) {
  if (!id) return '—';
  const s = String(id).trim();
  return s.length >= 4 ? s.slice(-4) : s;
}

function updateAttendanceExportButton() {
  const exportBtn = $('btn-attendance-export');
  if (exportBtn) {
    exportBtn.disabled = !$('filter-date').value || !$('filter-qual').value;
  }
}

// ─── Master Trainee Roster Loader ───
async function loadMasterRoster() {
  if (masterRoster.length > 0) return masterRoster;
  try {
    const res = await fetch('/assets/trainee-roster.json');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        masterRoster = data.map(function (t, index) {
          const id = String(t.id || '').trim();
          const prefix = id.charAt(0);
          const qual = QUALIFICATIONS[prefix] || 'Cookery';
          return {
            id: id,
            rosterKey: String(index) + ':' + id,
            qrCode: getQrCode(id),
            name: String(t.name || '').trim(),
            qualification: qual,
            isPlaceholder: /^(?:[1-6]|X)6666$/i.test(id)
          };
        });
      }
    }
  } catch (err) {
    console.warn('Could not load trainee-roster.json:', err);
  }
  return masterRoster;
}

async function fetchAttendanceExportRecords(date, qualification, search) {
  const params = new URLSearchParams({
    action: 'records',
    page: '1',
    pageSize: String(EXPORT_PAGE_SIZE)
  });
  if (date) params.set('date', date);
  if (qualification) params.set('filterQualification', qualification);
  if (search) params.set('search', search);

  const firstResponse = await fetch(CONFIG.API_URL + '?' + params.toString());
  if (!firstResponse.ok) throw new Error('Attendance API returned HTTP ' + firstResponse.status + '.');
  const firstData = await firstResponse.json();
  if (firstData.status !== 'ok' || !firstData.pagination) {
    throw new Error(firstData.message || 'Could not load attendance records for this report.');
  }

  const totalPages = firstData.pagination.totalPages;
  if (!Number.isInteger(totalPages) || totalPages < 0) {
    throw new Error('Attendance API returned invalid pagination data.');
  }

  const pageRequests = [];
  for (let page = 2; page <= totalPages; page++) {
    const pageParams = new URLSearchParams(params);
    pageParams.set('page', String(page));
    pageRequests.push(fetch(CONFIG.API_URL + '?' + pageParams.toString()).then(async function (response) {
      if (!response.ok) throw new Error('Attendance API returned HTTP ' + response.status + '.');
      const data = await response.json();
      if (data.status !== 'ok' || !Array.isArray(data.records)) {
        throw new Error(data.message || 'Could not load all attendance records for this report.');
      }
      return data.records;
    }));
  }
  const additionalRecords = await Promise.all(pageRequests);
  if (!Array.isArray(firstData.records)) {
    throw new Error('Attendance API returned invalid attendance records.');
  }
  return firstData.records.concat(...additionalRecords);
}

async function downloadAttendanceCheck() {
  const button = $('btn-attendance-export');
  const status = $('attendance-export-status');
  const date = $('filter-date').value;
  const qualification = $('filter-qual').value;
  if (!date || !qualification) {
    status.textContent = 'Select both a date and qualification first.';
    return;
  }

  button.disabled = true;
  status.textContent = 'Preparing attendance report…';
  try {
    await configReady;
    if (!apiReady()) throw new Error('API URL is not configured yet.');
    const roster = await loadMasterRoster();
    if (!roster.length) throw new Error('The trainee roster has an invalid format or could not be loaded.');
    const records = await fetchAttendanceExportRecords(date, qualification);
    const rows = AttendanceExport.buildAttendanceRows(roster, records, qualification);
    if (!rows.length) throw new Error('No trainees were found for the selected qualification in the roster.');

    const workbook = await AttendanceExport.createWorkbook(rows, JSZip);
    const url = URL.createObjectURL(workbook);
    const link = document.createElement('a');
    const safeQualification = qualification.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.href = url;
    link.download = 'attendance-check-' + safeQualification + '-' + date + '.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    status.textContent = 'Downloaded attendance report for ' + qualification + ' on ' + date + '.';
  } catch (error) {
    status.textContent = error.message || 'Could not create the attendance report.';
    console.error('Error creating attendance check:', error);
  } finally {
    updateAttendanceExportButton();
  }
}

// ─── Fetch a page of records and dashboard summaries ───
async function loadAllData(page = currentPage) {
  const requestId = ++loadRequestId;
  await configReady;
  if (requestId !== loadRequestId) return;
  if (!apiReady()) {
    $('table-message').textContent = 'API URL is not configured yet.';
    $('table-message').hidden = false;
    return;
  }

  await loadMasterRoster();

  $('table-message').textContent = 'Loading records from Google Sheets…';
  $('table-message').hidden = false;
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
    updateAttendanceExportButton();

    let date = $('filter-date').value;
    const qualification = $('filter-qual').value;
    const search = $('search-student').value.trim();

    // ─── REGULAR & NO-TIMEOUT API FETCH ───
    const params = new URLSearchParams({
      action: 'records',
      page: String(page),
      pageSize: String(PAGE_SIZE)
    });
    if (date) params.set('date', date);
    if (qualification) params.set('filterQualification', qualification);
    if (search) params.set('search', search);
    if (currentStatusFilter === 'no-timeout') {
      params.set('status', 'no-timeout');
    } else if (currentStatusFilter === 'present') {
      params.set('status', 'present');
    }

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

    // Fallback client-side filter if backend hasn't been updated with status param
    if (currentStatusFilter === 'no-timeout') {
      currentRecords = currentRecords.filter(function (r) {
        return Boolean(r.timeIn) && !r.timeOut;
      });
    }

    summary = data.summary;
    if (requestId !== loadRequestId) return;
    currentPage = data.pagination.page;
    totalPages = Math.max(data.pagination.totalPages, 1);

    renderSummaryCards(summary);
    renderDailyHistoryAndChart(summary.dateCounts || {});
    renderQualificationProgress(summary.qualificationCounts || {});
    updateFilterPills(summary);
    renderFilteredTable(data.pagination);
  } catch (err) {
    if (requestId !== loadRequestId) return;
    $('table-message').textContent = err.message || 'Failed to load records from Google Sheets. Check connection and click Refresh.';
    $('table-message').hidden = false;
    console.error('Error loading progress data:', err);
  }
}

function updatePillSelection(status) {
  document.querySelectorAll('.filter-pill').forEach(function (pill) {
    pill.classList.toggle('active', pill.getAttribute('data-status') === status);
  });
}

function updateFilterPills(summaryData) {
  const noTimeoutPillCount = $('count-pill-no-timeout');
  if (noTimeoutPillCount && summaryData) {
    noTimeoutPillCount.textContent = summaryData.todayNoTimeOut !== undefined ? summaryData.todayNoTimeOut : 0;
  }
}

// ─── Daily Student History & Filtering Table ───
function renderFilteredTable(pagination) {
  const today = getTodayIso();
  const body = $('records-body');
  body.replaceChildren();

  currentRecords.forEach(function (r) {
    const tr = document.createElement('tr');
    
    // 1. Trainee ID
    const tdId = document.createElement('td');
    tdId.innerHTML = '<span class="id-badge">' + (r.id || '—') + '</span>';

    // 2. QR Code #
    const tdQr = document.createElement('td');
    tdQr.innerHTML = '<span class="badge-qr">' + getQrCode(r.id) + '</span>';

    // 3. Trainee Name
    const tdName = document.createElement('td');
    tdName.textContent = r.name || '—';

    // 4. Qualification
    const tdQual = document.createElement('td');
    const qualBadge = document.createElement('span');
    qualBadge.className = 'badge-qual';
    qualBadge.textContent = r.qualification || '—';
    tdQual.appendChild(qualBadge);

    // 5. Date
    const tdDate = document.createElement('td');
    tdDate.textContent = r.date || '—';

    // 6. Time In
    const tdIn = document.createElement('td');
    tdIn.textContent = r.timeIn || '—';

    // 7. Time Out
    const tdOut = document.createElement('td');
    if (r.timeOut) {
      tdOut.innerHTML = '<span class="tag-done">' + r.timeOut + '</span>';
    } else {
      if (r.date && r.date < today) {
        tdOut.innerHTML = '<span class="tag-no-timeout">No Time Out</span>';
      } else {
        tdOut.innerHTML = '<span class="tag-pending">Pending</span>';
      }
    }

    // 8. Overall Status Badge
    const tdStatus = document.createElement('td');
    if (r.timeOut) {
      tdStatus.innerHTML = '<span class="tag-attended">Attended</span>';
    } else if (r.date && r.date < today) {
      tdStatus.innerHTML = '<span class="tag-no-timeout">No Time Out</span>';
    } else {
      tdStatus.innerHTML = '<span class="tag-pending">Pending Time Out</span>';
    }

    tr.append(tdId, tdQr, tdName, tdQual, tdDate, tdIn, tdOut, tdStatus);
    body.appendChild(tr);
  });

  const firstRecord = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastRecord = Math.min(pagination.page * pagination.pageSize, pagination.total);
  $('count-shown').textContent = firstRecord + '–' + lastRecord;
  $('count-filtered').textContent = pagination.total;
  $('count-total').textContent = (summary && summary.totalRecords) ? summary.totalRecords : pagination.total;
  $('page-label').textContent = 'Page ' + pagination.page + ' of ' + Math.max(pagination.totalPages, 1);
  $('prev-page').disabled = pagination.page <= 1;
  $('next-page').disabled = pagination.page >= pagination.totalPages;

  if (currentRecords.length > 0) {
    $('table-message').textContent = '';
    $('table-message').hidden = true;
  } else if ((summary && summary.totalRecords > 0) || $('search-student').value.trim() || currentStatusFilter !== 'all') {
    $('table-message').textContent = 'No records match your selected filters. Try clearing filters.';
    $('table-message').hidden = false;
  } else {
    $('table-message').textContent = 'No attendance recorded in the system yet.';
    $('table-message').hidden = false;
  }
}

// ─── Event Listeners ───
$('filter-date').addEventListener('input', function () { loadAllData(1); });
$('filter-qual').addEventListener('change', function () { loadAllData(1); });
$('filter-date').addEventListener('input', updateAttendanceExportButton);
$('filter-qual').addEventListener('change', updateAttendanceExportButton);

$('filter-status').addEventListener('change', function () {
  currentStatusFilter = this.value;
  updatePillSelection(currentStatusFilter);
  loadAllData(1);
});

// Quick status filter pills
document.querySelectorAll('.filter-pill').forEach(function (pill) {
  pill.addEventListener('click', function () {
    currentStatusFilter = this.getAttribute('data-status');
    $('filter-status').value = currentStatusFilter;
    updatePillSelection(currentStatusFilter);
    loadAllData(1);
  });
});

$('btn-attendance-export').addEventListener('click', downloadAttendanceCheck);

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
  $('filter-status').value = 'all';
  currentStatusFilter = 'all';
  updatePillSelection('all');
  $('search-student').value = '';
  loadAllData(1);
});

// Initial load
loadAllData();
