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
  const targetQual = qualification || (!CONFIG.IS_ADMIN ? QUALIFICATIONS[CONFIG.QUALIFICATION] : '');
  const allRecordedDates = summary && summary.dateCounts ? Object.keys(summary.dateCounts).sort() : [];

  let absentList = [];
  let effectiveDate = date;

  if (effectiveDate) {
    // 1. Fetch attendance records for this date
    const records = await fetchAttendanceExportRecords(effectiveDate, targetQual, search);
    if (requestId !== loadRequestId) return;

    // 2. Filter master roster by qualification and search
    const rosterForFilter = masterRoster.filter(function (t) {
      if (targetQual && t.qualification !== targetQual) return false;
      if (search) {
        const term = search.toLowerCase();
        const matchId = t.id.toLowerCase().includes(term);
        const matchQr = t.qrCode.toLowerCase().includes(term);
        const matchName = t.name.toLowerCase().includes(term);
        if (!matchId && !matchQr && !matchName) return false;
      }
      return true;
    });

    // 3. Match who attended vs who is absent
    const attendedIds = new Set(records.map(function (r) { return String(r.id || '').trim(); }));
    absentList = rosterForFilter.filter(function (t) {
      return !attendedIds.has(t.id);
    }).map(function (t) {
      return {
        id: t.id,
        name: t.name,
        qualification: t.qualification,
        date: effectiveDate,
        timeIn: '—',
        timeOut: '—',
        status: 'absent'
      };
    });
  } else if (search) {
    // Search with no specific date: show the session dates that matching student(s) missed
    const matchingStudents = masterRoster.filter(function (t) {
      if (targetQual && t.qualification !== targetQual) return false;
      const term = search.toLowerCase();
      return t.id.toLowerCase().includes(term) ||
             t.qrCode.toLowerCase().includes(term) ||
             t.name.toLowerCase().includes(term);
    });

    if (matchingStudents.length > 0) {
      const records = await fetchAttendanceExportRecords('', targetQual, search);
      if (requestId !== loadRequestId) return;

      const attendedDatesByStudent = {};
      records.forEach(function (r) {
        const id = String(r.id || '').trim();
        if (!attendedDatesByStudent[id]) attendedDatesByStudent[id] = new Set();
        if (r.date) attendedDatesByStudent[id].add(r.date);
      });

      matchingStudents.forEach(function (student) {
        const attendedDates = attendedDatesByStudent[student.id] || new Set();
        allRecordedDates.slice().reverse().forEach(function (sessionDate) {
          if (!attendedDates.has(sessionDate)) {
            absentList.push({
              id: student.id,
              name: student.name,
              qualification: student.qualification,
              date: sessionDate,
              timeIn: '—',
              timeOut: '—',
              status: 'absent'
            });
          }
        });
      });
    }
  } else {
    // No date and no search: default to latest recorded session date or today
    effectiveDate = allRecordedDates.length > 0 ? allRecordedDates[allRecordedDates.length - 1] : getTodayIso();
    $('filter-date').value = effectiveDate;
    updateAttendanceExportButton();

    const records = await fetchAttendanceExportRecords(effectiveDate, targetQual, '');
    if (requestId !== loadRequestId) return;

    const rosterForFilter = masterRoster.filter(function (t) {
      return !targetQual || t.qualification === targetQual;
    });

    const attendedIds = new Set(records.map(function (r) { return String(r.id || '').trim(); }));
    absentList = rosterForFilter.filter(function (t) {
      return !attendedIds.has(t.id);
    }).map(function (t) {
      return {
        id: t.id,
        name: t.name,
        qualification: t.qualification,
        date: effectiveDate,
        timeIn: '—',
        timeOut: '—',
        status: 'absent'
      };
    });
  }

  // 4. Paginate absent records
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
function cleanNameForLookup(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const absenteeDateAttendedCache = {};

function populateAbsenteeDateDropdown(dates, dateCounts) {
  const dateSelect = $('absentee-filter-date');
  if (!dateSelect) return;
  const currentVal = dateSelect.value || 'all';

  const existingOptions = Array.from(dateSelect.options).map(function (o) { return o.value; });
  const newValues = ['all'].concat(dates);
  if (existingOptions.join(',') === newValues.join(',')) return;

  dateSelect.replaceChildren();
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All Time (' + dates.length + ' Recorded Sessions)';
  dateSelect.appendChild(allOpt);

  dates.slice().reverse().forEach(function (d) {
    const opt = document.createElement('option');
    opt.value = d;
    const count = dateCounts[d] || 0;
    opt.textContent = formatDateDisplay(d) + ' (' + count + ' students)';
    dateSelect.appendChild(opt);
  });

  if (newValues.includes(currentVal)) {
    dateSelect.value = currentVal;
  }
}

async function loadDateForAbsenteeAnalytics(dateRange) {
  if (absenteeDateAttendedCache[dateRange]) {
    updateAbsenteeAnalytics(summary, masterRoster);
    return;
  }
  const titleEl = $('most-absent-title');
  if (titleEl) titleEl.textContent = 'Loading records for ' + formatDateDisplay(dateRange) + '...';
  try {
    const records = await fetchAttendanceExportRecords(dateRange, '', '');
    const attendedSet = new Set();
    records.forEach(function (r) {
      if (r.id) attendedSet.add(String(r.id).trim());
      if (r.name) attendedSet.add(cleanNameForLookup(r.name));
    });
    absenteeDateAttendedCache[dateRange] = attendedSet;
  } catch (err) {
    console.error('Could not load date records for absentee analytics:', err);
  }
  updateAbsenteeAnalytics(summary, masterRoster);
}

function updateAbsenteeAnalytics(summaryData, roster) {
  if (!summaryData) return;
  const allDates = Object.keys(summaryData.dateCounts || {}).sort();
  populateAbsenteeDateDropdown(allDates, summaryData.dateCounts || {});

  const qualSelect = $('absentee-filter-qual');
  const targetQual = qualSelect ? qualSelect.value : '';
  const assignedQual = !CONFIG.IS_ADMIN ? QUALIFICATIONS[CONFIG.QUALIFICATION] : '';
  const finalQual = targetQual || assignedQual;

  if (qualSelect && !CONFIG.IS_ADMIN) {
    qualSelect.value = assignedQual;
    qualSelect.disabled = true;
  }

  const dateSelect = $('absentee-filter-date');
  const dateRange = dateSelect ? dateSelect.value : 'all';

  const searchInput = $('absentee-search-student');
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

  // Fix 1: Number input + Show All support
  const limitInput = $('absentee-limit-input');
  const limitVal = limitInput ? limitInput.value.trim() : '';
  const limitNum = limitVal ? parseInt(limitVal, 10) : null;

  // Filter roster by qualification and search
  const applicableRoster = roster.filter(function (t) {
    if (finalQual && t.qualification !== finalQual) return false;
    if (searchTerm) {
      const matchId = t.id.toLowerCase().includes(searchTerm);
      const matchQr = t.qrCode.toLowerCase().includes(searchTerm);
      const matchName = t.name.toLowerCase().includes(searchTerm);
      if (!matchId && !matchQr && !matchName) return false;
    }
    return true;
  });

  const isSpecificDate = dateRange !== 'all';
  const totalSessions = isSpecificDate ? 1 : allDates.length;
  const attendedSet = isSpecificDate ? (absenteeDateAttendedCache[dateRange] || new Set()) : null;

  const stats = applicableRoster.map(function (t) {
    let daysPresent = 0;
    let daysAbsent = 0;
    let rate = 100;
    let detailStr = '';

    if (isSpecificDate) {
      const norm = cleanNameForLookup(t.name);
      const wasPresent = attendedSet ? (attendedSet.has(t.id) || attendedSet.has(norm)) : false;
      daysPresent = wasPresent ? 1 : 0;
      daysAbsent = wasPresent ? 0 : 1;
      rate = wasPresent ? 100 : 0;
      detailStr = wasPresent ? 'Attended (1/1 session)' : 'Absent (0/1 session)';
    } else {
      const norm = cleanNameForLookup(t.name);
      daysPresent = (summaryData.traineeAttendanceCounts && (summaryData.traineeAttendanceCounts[t.id] || summaryData.traineeAttendanceCounts[norm]))
        ? (summaryData.traineeAttendanceCounts[t.id] || summaryData.traineeAttendanceCounts[norm])
        : 0;
      daysAbsent = Math.max(0, totalSessions - daysPresent);
      rate = totalSessions > 0 ? Math.round((daysPresent / totalSessions) * 100) : 100;
      detailStr = daysAbsent + ' days (' + daysPresent + '/' + totalSessions + ' sessions)';
    }

    return {
      id: t.id,
      qrCode: t.qrCode,
      name: t.name,
      qualification: t.qualification,
      daysPresent: daysPresent,
      daysAbsent: daysAbsent,
      totalSessions: totalSessions,
      rate: rate,
      detailStr: detailStr
    };
  });

  stats.sort(function (a, b) {
    return b.daysAbsent - a.daysAbsent || a.name.localeCompare(b.name);
  });

  // Fix 4: ONLY show students who have an absence record (daysAbsent > 0).
  // Students who are NOT absent (0 days absent) will NEVER be shown on absentees!
  const absenteesOnly = stats.filter(function (s) {
    return s.daysAbsent > 0;
  });

  // Fix 1: Slice by user-entered count or show all
  const displayedStudents = (limitNum && limitNum > 0)
    ? absenteesOnly.slice(0, limitNum)
    : absenteesOnly;

  const maxAbsent = absenteesOnly.length > 0 ? absenteesOnly[0].daysAbsent : 0;

  // Update Summary Stat Card
  const statCountEl = $('stat-most-absent-count');
  const statNameEl = $('stat-most-absent-name');
  if (statCountEl) statCountEl.textContent = maxAbsent;
  if (statNameEl) {
    if (absenteesOnly.length > 0 && maxAbsent > 0) {
      statNameEl.textContent = absenteesOnly[0].name;
    } else {
      statNameEl.textContent = totalSessions === 0 ? 'No sessions' : '0 absences';
    }
  }

  // Update Highlight Banner
  const titleEl = $('most-absent-title');
  const contentEl = $('most-absentees-content');
  const badgeEl = $('most-absent-badge');

  if (!titleEl || !contentEl) return;

  // Fix 3: Badge ALWAYS says "Absentees" only (do not show how many students in the badge)
  if (badgeEl) {
    badgeEl.textContent = 'Absentees';
    badgeEl.style.background = '';
    badgeEl.style.color = '';
    badgeEl.style.borderColor = '';
  }

  if (totalSessions === 0) {
    titleEl.textContent = 'No Attendance Sessions Recorded Yet';
    contentEl.innerHTML = '<p class="hint">Absentee tracking will activate automatically once attendance records are scanned.</p>';
  } else if (absenteesOnly.length === 0) {
    titleEl.textContent = 'No Students are Absent';
    contentEl.innerHTML = '<p class="hint">Great news! None of the matching trainees have an absence record for the selected criteria (100% attendance).</p>';
  } else {
    const filterDesc = finalQual ? ' in ' + finalQual : '';
    const searchDesc = searchTerm ? ' matching "' + searchTerm + '"' : '';
    const dateDesc = isSpecificDate ? ' on ' + formatDateDisplay(dateRange) : ' across ' + totalSessions + ' Sessions';
    titleEl.textContent = 'Student Absentees' + filterDesc + dateDesc + searchDesc;

    let tableHtml = '<div class="table-wrap top-absentees-wrap"><table class="top-absentees-table">';
    tableHtml += '<thead><tr>';
    tableHtml += '<th>Rank</th>';
    tableHtml += '<th>Trainee ID</th>';
    tableHtml += '<th>QR Code #</th>';
    tableHtml += '<th>Name</th>';
    tableHtml += '<th>Qualification</th>';
    tableHtml += '<th>Days Absent</th>';
    tableHtml += '<th>Attendance Rate</th>';
    tableHtml += '<th>Action</th>';
    tableHtml += '</tr></thead><tbody>';

    displayedStudents.forEach(function (s, index) {
      const rankNum = index + 1;
      tableHtml += '<tr>';
      tableHtml += '<td><span class="rank-badge rank-' + rankNum + '">#' + rankNum + '</span></td>';
      tableHtml += '<td><span class="id-badge">' + s.id + '</span></td>';
      tableHtml += '<td><span class="badge-qr">QR: ' + s.qrCode + '</span></td>';
      tableHtml += '<td><strong>' + s.name + '</strong></td>';
      tableHtml += '<td><span class="badge-qual">' + s.qualification + '</span></td>';
      tableHtml += '<td><strong style="color:#b91c1c;">' + s.daysAbsent + ' days</strong> <span class="hint">(' + s.detailStr + ')</span></td>';
      tableHtml += '<td>' + s.rate + '%</td>';
      tableHtml += '<td><button class="btn ghost btn-sm btn-filter-student" type="button" data-id="' + s.id + '">Filter</button></td>';
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table></div>';
    contentEl.innerHTML = tableHtml;

    contentEl.querySelectorAll('.btn-filter-student').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterToStudent(btn.getAttribute('data-id'));
      });
    });
  }
}
function filterToStudent(studentId) {
  $('search-student').value = studentId;
  currentStatusFilter = 'all';
  $('filter-status').value = 'all';
  updatePillSelection('all');
  loadAllData(1);
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
      const selectedDate = $('filter-date') ? $('filter-date').value : '';
      const selectedQual = $('filter-qual') ? $('filter-qual').value : '';
      const totalEnrolled = masterRoster.filter(function (t) {
        return !selectedQual || t.qualification === selectedQual;
      }).length || (summaryData ? summaryData.totalTrainees : 0);

      let attendedCount = 0;
      if (selectedDate && summaryData && summaryData.dateCounts && summaryData.dateCounts[selectedDate] !== undefined) {
        attendedCount = summaryData.dateCounts[selectedDate];
      } else if (summaryData && summaryData.todayAttendance !== undefined) {
        attendedCount = summaryData.todayAttendance;
      }

      if (totalEnrolled > 0) {
        absentPillCount.textContent = Math.max(0, totalEnrolled - attendedCount);
      } else {
        absentPillCount.textContent = '—';
      }
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

// ─── Absentee Tracker Filter Listeners ───
// Fix 2: Refresh button
const btnRefreshAbsentees = $('btn-refresh-absentees');
if (btnRefreshAbsentees) {
  btnRefreshAbsentees.addEventListener('click', function () {
    loadAllData(currentPage);
  });
}

const absenteeQualSelect = $('absentee-filter-qual');
if (absenteeQualSelect) {
  absenteeQualSelect.addEventListener('change', function () {
    updateAbsenteeAnalytics(summary, masterRoster);
  });
}

const absenteeDateSelect = $('absentee-filter-date');
if (absenteeDateSelect) {
  absenteeDateSelect.addEventListener('change', function () {
    const val = this.value;
    if (val !== 'all' && !absenteeDateAttendedCache[val]) {
      loadDateForAbsenteeAnalytics(val);
    } else {
      updateAbsenteeAnalytics(summary, masterRoster);
    }
  });
}

let absenteeSearchTimer = null;
const absenteeSearchInput = $('absentee-search-student');
if (absenteeSearchInput) {
  absenteeSearchInput.addEventListener('input', function () {
    clearTimeout(absenteeSearchTimer);
    absenteeSearchTimer = setTimeout(function () {
      updateAbsenteeAnalytics(summary, masterRoster);
    }, 200);
  });
}

// Fix 1: Number input + Show All button
const absenteeLimitInput = $('absentee-limit-input');
if (absenteeLimitInput) {
  absenteeLimitInput.addEventListener('input', function () {
    updateAbsenteeAnalytics(summary, masterRoster);
  });
}

const btnShowAllAbsentees = $('btn-show-all-absentees');
if (btnShowAllAbsentees) {
  btnShowAllAbsentees.addEventListener('click', function () {
    if ($('absentee-limit-input')) $('absentee-limit-input').value = '';
    updateAbsenteeAnalytics(summary, masterRoster);
  });
}

const btnResetAbsentee = $('btn-reset-absentee-filter');
if (btnResetAbsentee) {
  btnResetAbsentee.addEventListener('click', function () {
    if ($('absentee-filter-qual') && CONFIG.IS_ADMIN) $('absentee-filter-qual').value = '';
    if ($('absentee-filter-date')) $('absentee-filter-date').value = 'all';
    if ($('absentee-search-student')) $('absentee-search-student').value = '';
    if ($('absentee-limit-input')) $('absentee-limit-input').value = '10';
    updateAbsenteeAnalytics(summary, masterRoster);
  });
}
// Initial load
loadAllData();
