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
let currentStatusFilter = 'all'; // 'all', 'present', 'absent', 'no-timeout'
let rankedAbsentees = [];

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
        masterRoster = data.map(function (t) {
          const id = String(t.id || '').trim();
          const prefix = id.charAt(0);
          const qual = QUALIFICATIONS[prefix] || 'Cookery';
          return {
            id: id,
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

async function fetchAttendanceExportRecords(date, qualification) {
  const params = new URLSearchParams({
    action: 'records',
    page: '1',
    pageSize: String(EXPORT_PAGE_SIZE),
    date: date
  });
  if (qualification) {
    params.set('filterQualification', qualification);
  }

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

    // ─── ABSENT FILTER SPECIAL HANDLING ───
    if (currentStatusFilter === 'absent') {
      await handleAbsentFilter(page, date, qualification, search, requestId);
      return;
    }

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
    currentPage = data.pagination.page;
    totalPages = Math.max(data.pagination.totalPages, 1);

    renderSummaryCards(summary);
    renderDailyHistoryAndChart(summary.dateCounts || {});
    renderQualificationProgress(summary.qualificationCounts || {});
    updateAbsenteeAnalytics(summary, masterRoster);
    updateFilterPills(summary);
    renderFilteredTable(data.pagination);
  } catch (err) {
    if (requestId !== loadRequestId) return;
    $('table-message').textContent = err.message || 'Failed to load records from Google Sheets. Check connection and click Refresh.';
    $('table-message').hidden = false;
    console.error('Error loading progress data:', err);
  }
}

// ─── Absent Filter Controller ───
async function handleAbsentFilter(page, date, qualification, search, requestId) {
  // If no date is chosen, pick the most recent date from summary or today
  if (!date) {
    if (summary && summary.dateCounts && Object.keys(summary.dateCounts).length > 0) {
      const dates = Object.keys(summary.dateCounts).sort();
      date = dates[dates.length - 1];
    } else {
      date = getTodayIso();
    }
    $('filter-date').value = date;
    updateAttendanceExportButton();
  }

  // 1. Fetch attendance records for this date
  const records = await fetchAttendanceExportRecords(date, qualification);
  if (requestId !== loadRequestId) return;

  // 2. Filter master roster by qualification
  const targetQual = qualification || (!CONFIG.IS_ADMIN ? QUALIFICATIONS[CONFIG.QUALIFICATION] : '');
  const rosterForQual = masterRoster.filter(function (t) {
    return !targetQual || t.qualification === targetQual;
  });

  // 3. Match who attended vs who is absent
  let absentList = [];
  try {
    if (targetQual && AttendanceExport && typeof AttendanceExport.buildAttendanceRows === 'function') {
      const rows = AttendanceExport.buildAttendanceRows(masterRoster, records, targetQual);
      absentList = rows.filter(function (r) { return r.status === 'Absent'; }).map(function (r) {
        return {
          id: r.id,
          name: r.name,
          qualification: targetQual,
          date: date,
          timeIn: '—',
          timeOut: '—',
          status: 'absent'
        };
      });
    } else {
      const attendedIds = new Set(records.map(function (r) { return String(r.id || '').trim(); }));
      absentList = rosterForQual.filter(function (t) {
        return !attendedIds.has(t.id);
      }).map(function (t) {
        return {
          id: t.id,
          name: t.name,
          qualification: t.qualification,
          date: date,
          timeIn: '—',
          timeOut: '—',
          status: 'absent'
        };
      });
    }
  } catch (_) {
    const attendedIds = new Set(records.map(function (r) { return String(r.id || '').trim(); }));
    absentList = rosterForQual.filter(function (t) {
      return !attendedIds.has(t.id);
    }).map(function (t) {
      return {
        id: t.id,
        name: t.name,
        qualification: t.qualification,
        date: date,
        timeIn: '—',
        timeOut: '—',
        status: 'absent'
      };
    });
  }

  // 4. Apply search filter
  if (search) {
    const term = search.toLowerCase();
    absentList = absentList.filter(function (r) {
      const qr = getQrCode(r.id).toLowerCase();
      const id = String(r.id || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      return id.includes(term) || qr.includes(term) || name.includes(term);
    });
  }

  // 5. Paginate absent records
  const total = absentList.length;
  const computedTotalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const safePage = Math.min(Math.max(page, 1), computedTotalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  currentRecords = absentList.slice(start, start + PAGE_SIZE);
  currentPage = safePage;
  totalPages = computedTotalPages;

  const pagination = {
    page: safePage,
    pageSize: PAGE_SIZE,
    total: total,
    totalPages: computedTotalPages
  };

  renderSummaryCards(summary || { totalTrainees: masterRoster.length, todayAttendance: 0, totalRecords: 0 });
  if (summary) {
    renderDailyHistoryAndChart(summary.dateCounts || {});
    renderQualificationProgress(summary.qualificationCounts || {});
    updateAbsenteeAnalytics(summary, masterRoster);
    updateFilterPills(summary, total);
  }
  renderFilteredTable(pagination);
}

// ─── Summary Stat Cards ───
function renderSummaryCards(data) {
  if (!data) return;
  $('stat-total-students').textContent = data.totalTrainees || masterRoster.length || 0;
  $('stat-today-attendance').textContent = data.todayAttendance || 0;
  $('stat-total-records').textContent = data.totalRecords || 0;

  const noTimeoutEl = $('stat-no-timeout');
  if (noTimeoutEl) {
    noTimeoutEl.textContent = data.todayNoTimeOut !== undefined ? data.todayNoTimeOut : 0;
  }
}

// ─── Daily History Table & Bar Chart ───
function renderDailyHistoryAndChart(dateCounts) {
  const dates = Object.keys(dateCounts).sort();
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
    barFill.style.width = '0%';

    const countSpan = document.createElement('div');
    countSpan.className = 'chart-count';
    countSpan.innerHTML = count + ' <span class="unit">(' + pct + '%)</span>';

    barWrap.appendChild(barFill);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countSpan);

    chartContainer.appendChild(row);

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
    barFill.style.width = '0%';

    const countSpan = document.createElement('div');
    countSpan.className = 'chart-count';
    countSpan.innerHTML = count + ' <span class="unit">' + (count === 1 ? 'trainee' : 'trainees') + '</span>';

    barWrap.appendChild(barFill);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countSpan);

    chartContainer.appendChild(row);

    setTimeout(function () {
      barFill.style.width = count === 0 ? '0%' : Math.max(pct, 4) + '%';
    }, 40 + idx * 35);
  });
}

// ─── Feature: Student with Most Absentees Analytics ───
function updateAbsenteeAnalytics(summaryData, roster) {
  if (!summaryData) return;
  const dates = Object.keys(summaryData.dateCounts || {}).sort();
  const totalSessions = dates.length;
  const selectedQual = $('filter-qual').value;
  const assignedQual = !CONFIG.IS_ADMIN ? QUALIFICATIONS[CONFIG.QUALIFICATION] : '';
  const targetQual = selectedQual || assignedQual;

  const applicableRoster = roster.filter(function (t) {
    return !targetQual || t.qualification === targetQual;
  });

  const stats = applicableRoster.map(function (t) {
    const daysPresent = (summaryData.traineeAttendanceCounts && summaryData.traineeAttendanceCounts[t.id])
      ? summaryData.traineeAttendanceCounts[t.id]
      : 0;
    const daysAbsent = Math.max(0, totalSessions - daysPresent);
    const rate = totalSessions > 0 ? Math.round((daysPresent / totalSessions) * 100) : 100;
    return {
      id: t.id,
      qrCode: t.qrCode,
      name: t.name,
      qualification: t.qualification,
      daysPresent: daysPresent,
      daysAbsent: daysAbsent,
      totalSessions: totalSessions,
      rate: rate
    };
  });

  stats.sort(function (a, b) {
    return b.daysAbsent - a.daysAbsent || a.name.localeCompare(b.name);
  });

  rankedAbsentees = stats;
  const maxAbsent = stats.length > 0 ? stats[0].daysAbsent : 0;
  const topStudents = stats.filter(function (s) { return s.daysAbsent === maxAbsent && maxAbsent > 0; });

  // Update Summary Stat Card
  const statCountEl = $('stat-most-absent-count');
  const statNameEl = $('stat-most-absent-name');
  if (statCountEl) statCountEl.textContent = maxAbsent;
  if (statNameEl) {
    if (topStudents.length === 1) {
      statNameEl.textContent = topStudents[0].name;
    } else if (topStudents.length > 1) {
      statNameEl.textContent = topStudents[0].name + ' (+' + (topStudents.length - 1) + ' tied)';
    } else {
      statNameEl.textContent = totalSessions === 0 ? 'No sessions' : '0 absences';
    }
  }

  // Update Highlight Banner
  const titleEl = $('most-absent-title');
  const contentEl = $('most-absentees-content');
  const filterBtn = $('btn-filter-top-absent');
  const badgeEl = $('most-absent-badge');

  if (!titleEl || !contentEl) return;

  if (totalSessions === 0) {
    titleEl.textContent = 'No Attendance Sessions Recorded Yet';
    if (badgeEl) badgeEl.textContent = 'Standby';
    contentEl.innerHTML = '<p class="hint">Absentee tracking will activate automatically once attendance records are scanned.</p>';
    if (filterBtn) filterBtn.disabled = true;
  } else if (maxAbsent === 0) {
    titleEl.textContent = '100% Perfect Attendance Across All Trainees';
    if (badgeEl) {
      badgeEl.textContent = 'Perfect';
      badgeEl.style.background = '#dcfce7';
      badgeEl.style.color = '#166534';
      badgeEl.style.borderColor = '#86efac';
    }
    contentEl.innerHTML = '<p class="hint">Great news! All registered trainees have attended every recorded training session (' + totalSessions + ' session' + (totalSessions === 1 ? '' : 's') + ').</p>';
    if (filterBtn) filterBtn.disabled = true;
  } else if (topStudents.length === 1) {
    const top = topStudents[0];
    if (badgeEl) {
      badgeEl.textContent = 'Most Absentees';
      badgeEl.style.background = '';
      badgeEl.style.color = '';
      badgeEl.style.borderColor = '';
    }
    titleEl.textContent = top.name;
    contentEl.innerHTML = `
      <div class="absentee-hero-grid">
        <div class="absentee-hero-item">
          <span class="hero-label">Trainee ID</span>
          <span class="hero-val id-badge">${top.id}</span>
        </div>
        <div class="absentee-hero-item">
          <span class="hero-label">QR Code #</span>
          <span class="hero-val"><span class="badge-qr">QR: ${top.qrCode}</span></span>
        </div>
        <div class="absentee-hero-item">
          <span class="hero-label">Specialization</span>
          <span class="hero-val"><span class="badge-qual">${top.qualification}</span></span>
        </div>
        <div class="absentee-hero-item">
          <span class="hero-label">Total Absences</span>
          <span class="hero-val highlight">${top.daysAbsent} days (${top.daysAbsent} of ${top.totalSessions} sessions)</span>
        </div>
        <div class="absentee-hero-item">
          <span class="hero-label">Attendance Rate</span>
          <span class="hero-val">${top.rate}%</span>
        </div>
      </div>
    `;
    if (filterBtn) {
      filterBtn.disabled = false;
      filterBtn.textContent = 'Filter this Student (' + top.id + ')';
      filterBtn.onclick = function () { filterToStudent(top.id); };
    }
  } else {
    // Tie
    if (badgeEl) {
      badgeEl.textContent = 'Tied Absentees';
      badgeEl.style.background = '';
      badgeEl.style.color = '';
      badgeEl.style.borderColor = '';
    }
    titleEl.textContent = 'Tied: ' + topStudents.length + ' Students with ' + maxAbsent + ' Absences Each';
    let chipsHtml = '<p class="hint" style="margin-bottom:8px">Click any student below to immediately filter their attendance records:</p><div class="absentee-tie-list">';
    topStudents.forEach(function (s) {
      chipsHtml += '<button type="button" class="absentee-tie-chip" data-id="' + s.id + '">';
      chipsHtml += '<span class="badge-qr">QR: ' + s.qrCode + '</span> ';
      chipsHtml += '<span>' + s.name + ' (' + s.qualification + ')</span>';
      chipsHtml += '</button>';
    });
    chipsHtml += '</div>';
    contentEl.innerHTML = chipsHtml;
    contentEl.querySelectorAll('.absentee-tie-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterToStudent(btn.getAttribute('data-id'));
      });
    });
    if (filterBtn) {
      filterBtn.disabled = false;
      filterBtn.textContent = 'Filter ' + topStudents[0].name.split(',')[0] + ' (' + topStudents[0].id + ')';
      filterBtn.onclick = function () { filterToStudent(topStudents[0].id); };
    }
  }

  renderAbsenteeRankings(rankedAbsentees);
  renderRosterDirectory(roster, stats);
}

// ─── Render Absentees Leaderboard Ranking ───
function renderAbsenteeRankings(rankedList) {
  const body = $('ranking-body');
  if (!body) return;
  body.replaceChildren();

  if (!rankedList || rankedList.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9; td.className = 'table-empty';
    td.textContent = 'No trainee attendance records available for ranking.';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  rankedList.forEach(function (s, index) {
    const tr = document.createElement('tr');

    const tdRank = document.createElement('td');
    tdRank.innerHTML = '<strong>#' + (index + 1) + '</strong>';

    const tdId = document.createElement('td');
    tdId.innerHTML = '<span class="id-badge">' + s.id + '</span>';

    const tdQr = document.createElement('td');
    tdQr.innerHTML = '<span class="badge-qr">QR: ' + s.qrCode + '</span>';

    const tdName = document.createElement('td');
    tdName.textContent = s.name;

    const tdQual = document.createElement('td');
    tdQual.innerHTML = '<span class="badge-qual">' + s.qualification + '</span>';

    const tdPres = document.createElement('td');
    tdPres.textContent = s.daysPresent + ' / ' + s.totalSessions;

    const tdAbs = document.createElement('td');
    if (s.daysAbsent > 0) {
      tdAbs.innerHTML = '<strong style="color:#b91c1c;">' + s.daysAbsent + ' days</strong>';
    } else {
      tdAbs.innerHTML = '<span style="color:#166534;font-weight:600;">0 (Perfect)</span>';
    }

    const tdRate = document.createElement('td');
    tdRate.textContent = s.rate + '%';

    const tdAction = document.createElement('td');
    const actionBtn = document.createElement('button');
    actionBtn.className = 'btn ghost btn-sm';
    actionBtn.textContent = 'Filter';
    actionBtn.type = 'button';
    actionBtn.onclick = function () { filterToStudent(s.id); };
    tdAction.appendChild(actionBtn);

    tr.append(tdRank, tdId, tdQr, tdName, tdQual, tdPres, tdAbs, tdRate, tdAction);
    body.appendChild(tr);
  });
}

// ─── Render Student Directory & QR Badges ───
function renderRosterDirectory(roster, stats) {
  const body = $('roster-body');
  if (!body) return;

  const searchTerm = ($('search-roster') ? $('search-roster').value : '').trim().toLowerCase();
  const qualFilter = $('filter-roster-qual') ? $('filter-roster-qual').value : '';
  const statsMap = {};
  if (stats) {
    stats.forEach(function (s) { statsMap[s.id] = s; });
  }

  const filtered = roster.filter(function (t) {
    const matchQual = !qualFilter || t.qualification === qualFilter;
    if (!matchQual) return false;
    if (!searchTerm) return true;
    return t.id.toLowerCase().includes(searchTerm) ||
      t.qrCode.toLowerCase().includes(searchTerm) ||
      t.name.toLowerCase().includes(searchTerm);
  });

  const countBadge = $('roster-count-badge');
  if (countBadge) {
    countBadge.textContent = filtered.length + ' trainee' + (filtered.length === 1 ? '' : 's');
  }

  body.replaceChildren();

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8; td.className = 'table-empty';
    td.textContent = 'No trainees match your search.';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  filtered.forEach(function (t) {
    const tr = document.createElement('tr');
    const st = statsMap[t.id] || { daysPresent: 0, daysAbsent: 0, rate: 100 };

    const tdId = document.createElement('td');
    tdId.innerHTML = '<span class="id-badge">' + t.id + '</span>';

    const tdQr = document.createElement('td');
    tdQr.innerHTML = '<span class="badge-qr">QR: ' + t.qrCode + '</span>';

    const tdName = document.createElement('td');
    tdName.textContent = t.name;

    const tdQual = document.createElement('td');
    tdQual.innerHTML = '<span class="badge-qual">' + t.qualification + '</span>';

    const tdPres = document.createElement('td');
    tdPres.textContent = st.daysPresent;

    const tdAbs = document.createElement('td');
    tdAbs.textContent = st.daysAbsent;

    const tdRate = document.createElement('td');
    tdRate.textContent = st.rate + '%';

    const tdAction = document.createElement('td');
    const actionBtn = document.createElement('button');
    actionBtn.className = 'btn ghost btn-sm';
    actionBtn.textContent = 'View Records';
    actionBtn.type = 'button';
    actionBtn.onclick = function () { filterToStudent(t.id); };
    tdAction.appendChild(actionBtn);

    tr.append(tdId, tdQr, tdName, tdQual, tdPres, tdAbs, tdRate, tdAction);
    body.appendChild(tr);
  });
}

function filterToStudent(studentId) {
  $('search-student').value = studentId;
  currentStatusFilter = 'all';
  $('filter-status').value = 'all';
  updatePillSelection('all');
  closePanels();
  loadAllData(1);
}

function closePanels() {
  if ($('absentee-ranking-panel')) $('absentee-ranking-panel').hidden = true;
  if ($('roster-directory-panel')) $('roster-directory-panel').hidden = true;
}

// ─── Filter Pills Sync ───
function updatePillSelection(status) {
  document.querySelectorAll('.filter-pill').forEach(function (pill) {
    pill.classList.toggle('active', pill.getAttribute('data-status') === status);
  });
}

function updateFilterPills(summaryData, absentCount) {
  const absentPillCount = $('count-pill-absent');
  const noTimeoutPillCount = $('count-pill-no-timeout');

  if (absentPillCount) {
    if (absentCount !== undefined) {
      absentPillCount.textContent = absentCount;
    } else {
      absentPillCount.textContent = '—';
    }
  }

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
    if (r.status === 'absent') {
      tdOut.textContent = '—';
    } else if (r.timeOut) {
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
    if (r.status === 'absent') {
      tdStatus.innerHTML = '<span class="tag-absent">Absent</span>';
    } else if (r.timeOut) {
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

// Toggle Top Absentees Rankings
const toggleRankingsBtn = $('btn-toggle-rankings');
if (toggleRankingsBtn) {
  toggleRankingsBtn.addEventListener('click', function () {
    const panel = $('absentee-ranking-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

const closeRankingsBtn = $('btn-close-rankings');
if (closeRankingsBtn) {
  closeRankingsBtn.addEventListener('click', function () {
    $('absentee-ranking-panel').hidden = true;
  });
}

// Toggle Student Directory & QR Badges
const viewRosterBtn = $('btn-view-roster');
if (viewRosterBtn) {
  viewRosterBtn.addEventListener('click', function () {
    const panel = $('roster-directory-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      renderRosterDirectory(masterRoster, rankedAbsentees);
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

const closeRosterBtn = $('btn-close-roster');
if (closeRosterBtn) {
  closeRosterBtn.addEventListener('click', function () {
    $('roster-directory-panel').hidden = true;
  });
}

const searchRosterInput = $('search-roster');
if (searchRosterInput) {
  searchRosterInput.addEventListener('input', function () {
    renderRosterDirectory(masterRoster, rankedAbsentees);
  });
}

const filterRosterQualSelect = $('filter-roster-qual');
if (filterRosterQualSelect) {
  filterRosterQualSelect.addEventListener('change', function () {
    renderRosterDirectory(masterRoster, rankedAbsentees);
  });
}

// Initial load
loadAllData();
