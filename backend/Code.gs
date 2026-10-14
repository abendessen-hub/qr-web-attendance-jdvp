/**
 * JDVP Attendance Backend — Luis Y. Ferrer Jr. Senior High School
 * Section: ICT-CP 12-KOTLIN
 *
 * Exactly 6 Sheets/tabs — one for each qualification:
 * 1. Cookery
 * 2. House Keeping
 * 3. CSS
 * 4. EIM
 * 5. SMAW NC II
 * 6. SMAW NC III
 *
 * Columns: Trainee ID | Name | Date | Time In | Time Out
 *
 * Supports 4-digit badge codes (e.g. 0001) that become 5-digit Trainee IDs (e.g. 60001)
 * when scanned and registered.
 *
 * Paste into Extensions → Apps Script inside the Google Sheet.
 * Run setup() once from the editor to create the 6 tabs with headers.
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 */

const QUALIFICATIONS = {
  '1': 'Cookery',
  '2': 'House Keeping',
  '3': 'CSS',
  '4': 'EIM',
  '5': 'SMAW NC II',
  '6': 'SMAW NC III'
};

const TIME_OUT_START = 15; // 3:00 PM (24-hour format)
const TIME_OUT_END = 22;   // 10:00 PM (24-hour format)

function setup() {
  const ss = SpreadsheetApp.getActive();

  for (const name of Object.values(QUALIFICATIONS)) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    
    sh.getRange('A1:E1')
      .setValues([['Trainee ID', 'Name', 'Date', 'Time In', 'Time Out']])
      .setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('C:E').setNumberFormat('@');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 110);
    sh.setColumnWidth(2, 200);
    sh.setColumnWidth(3, 120);
    sh.setColumnWidth(4, 110);
    sh.setColumnWidth(5, 110);
  }
}

function qualFromId(id) {
  const prefix = String(id).charAt(0);
  return QUALIFICATIONS[prefix] || null;
}

function isWithinTimeInWindow(hour) {
  return hour >= 7 && hour < TIME_OUT_START;
}

function isTimeOutAllowed(hour, allowAnyTime) {
  return allowAnyTime || (hour >= TIME_OUT_START && hour < TIME_OUT_END);
}

// Scans ONLY that qualification's sheet to find the next sequential ID
function getNextId(qualPrefix) {
  const qualName = QUALIFICATIONS[qualPrefix];
  if (!qualName) return null;

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(qualName);
  if (!sh) return String(parseInt(qualPrefix, 10) * 10000 + 1);

  const last = sh.getLastRow();
  const base = parseInt(qualPrefix, 10) * 10000;
  let max = base;

  if (last > 1) {
    const col = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < col.length; i++) {
      const n = parseInt(String(col[i][0]).trim(), 10);
      if (n > base && n < base + 10000 && n > max) {
        max = n;
      }
    }
  }

  return String(max + 1);
}

// Looks up a trainee by 5-digit ID (e.g. 60001) or 4-digit badge (e.g. 0001)
function findTrainee(code) {
  const textCode = String(code || '').trim();
  const ss = SpreadsheetApp.getActive();

  function findInSheet(id, qualName) {
    const sh = ss.getSheetByName(qualName);
    if (!sh) return null;
    const last = sh.getLastRow();
    if (last <= 1) return null;

    const match = sh.getRange(2, 1, last - 1, 1)
      .createTextFinder(id)
      .matchEntireCell(true)
      .findNext();
    if (!match) return null;

    return {
      id: id,
      name: String(sh.getRange(match.getRow(), 2).getValue()).trim(),
      qualification: qualName
    };
  }

  // 1. If 5-digit Trainee ID (e.g. 60001)
  if (textCode.length === 5) {
    const qualName = qualFromId(textCode);
    if (!qualName) return null;
    return findInSheet(textCode, qualName);
  }

  // 2. If 4-digit badge (e.g. 0001) -> check all 6 sheets for matching Q + 0001
  if (textCode.length === 4) {
    for (const [prefix, qualName] of Object.entries(QUALIFICATIONS)) {
      const target5 = prefix + textCode; // e.g. 60001
      const trainee = findInSheet(target5, qualName);
      if (trainee) return trainee;
    }
    return null;
  }

  return null;
}

function text(v, tz, p) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, p || 'yyyy-MM-dd');
  return String(v || '');
}

function normalizeSearchText(value) {
  return String(value || '')
    .replace(/\+/g, ' ')                  // 1. Convert URL plus signs back to spaces first
    .normalize('NFD')                     // 2. Separate letters from their accent marks
    .replace(/[\u0300-\u036f]/g, '')      // 3. Strip out the accent marks (e.g., é -> e)
    .toLowerCase()                        // 4. Convert to lowercase
    .replace(/[^\p{L}\p{N}\p{M}\s]+/gu, ' ') // 5. Replace punctuation/symbols with spaces (keeping whitespace \s)
    .replace(/\s+/g, ' ')                 // 6. Collapse multiple spaces into one
    .trim();                              // 7. Trim leading/trailing spaces
}

function normalizeQualificationName(value) {
  const normalized = String(value || '')
    .replace(/\+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return Object.values(QUALIFICATIONS).find(function(name) {
    return name.toLowerCase() === normalized;
  }) || '';
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function withScriptLock(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'register':   return registerTrainee(body);
      case 'scan':       return recordScan(body);
      case 'getNextId':  return nextId(body);
      case 'getTrainee': return getTrainee(body);
      default:           return reply({ status: 'error', message: 'Unknown action.' });
    }
  } catch (err) {
    return reply({ status: 'error', message: String(err) });
  }
}

// Registers a trainee into their qualification sheet (using QNNNN)
function registerTrainee(body) {
  const name = String(body.name || '').trim();
  const qp   = String(body.qualification || '').trim();
  if (!name) return reply({ status: 'error', message: 'Name is required.' });
  if (!QUALIFICATIONS[qp]) return reply({ status: 'error', message: 'Invalid qualification.' });

  const qualName = QUALIFICATIONS[qp];
  const requestedId = body.id ? String(body.id).trim() : null;
  if (requestedId && requestedId.length === 5 && qualFromId(requestedId) !== qualName) {
    return reply({ status: 'error', message: 'Trainee ID does not match the selected qualification.' });
  }

  if (requestedId && requestedId.length === 5) {
    const existing = findTrainee(requestedId);
    if (existing) {
      return reply({
        status: 'ok',
        id: existing.id,
        name: existing.name || name,
        qualification: existing.qualification
      });
    }
  }

  return withScriptLock(function() {
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(qualName);
    if (!sh) {
      setup();
      sh = ss.getSheetByName(qualName);
    }

    const id = requestedId && requestedId.length === 5 ? requestedId : getNextId(qp);
    if (qualFromId(id) !== qualName) {
      return reply({ status: 'error', message: 'Trainee ID does not match the selected qualification.' });
    }

    const existing = findTrainee(id);
    if (existing) {
      return reply({
        status: 'ok',
        id: existing.id,
        name: existing.name || name,
        qualification: existing.qualification
      });
    }

    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 5)
      .setNumberFormat('@')
      .setValues([[id, name, '', '', '']]);

    return reply({ status: 'ok', id: id, name: name, qualification: qualName });
  });
}

// Scans attendance for either 4-digit badge or 5-digit Trainee ID
function recordScan(body) {
  const code = String(body.id || '').trim();
  const t = findTrainee(code);

  if (!t) {
    return withScriptLock(function() {
      const registeredTrainee = findTrainee(code);
      if (!registeredTrainee) {
        const badge4 = code.length === 4 ? code : (code.length === 5 ? code.slice(-4) : code);
        return reply({
          status: 'not_registered',
          id: code,
          badge: badge4
        });
      }
      return recordScanForTrainee(body, registeredTrainee, true);
    });
  }

  return recordScanForTrainee(body, t, false);
}

function recordScanForTrainee(body, t, lockAlreadyHeld) {
  const requestedQualification = String(body.qualification || '').trim();
  if (requestedQualification && (!QUALIFICATIONS[requestedQualification] ||
      QUALIFICATIONS[requestedQualification] !== t.qualification)) {
    return reply({
      status: 'wrong_qualification',
      message: 'This trainee belongs to a different qualification.'
    });
  }

  const id = t.id; // full 5-digit ID (e.g. 60001)
  const qualName = t.qualification;
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(qualName);
  if (!sh) return reply({ status: 'not_registered', id: id, badge: id.slice(-4) });

  const tz = ss.getSpreadsheetTimeZone();
  const recordAttendance = function() {
    const now   = new Date();
    const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const hour  = parseInt(Utilities.formatDate(now, tz, 'HH'), 10);
    const stamp = Utilities.formatDate(now, tz, 'hh:mm a');

    const last = sh.getLastRow();
    let placeholderRowIndex = -1;

    if (last > 1) {
      const matches = sh.getRange(2, 1, last - 1, 1)
        .createTextFinder(id)
        .matchEntireCell(true)
        .findAll();

      for (const match of matches) {
        const rowIndex = match.getRow();
        const [dateValue, timeInValue, timeOutValue] = sh.getRange(rowIndex, 3, 1, 3).getValues()[0];
        const rDate = text(dateValue, tz);
        const rTimeIn = String(timeInValue || '').trim();
        const rTimeOut = String(timeOutValue || '').trim();

        // Check if there is an unactivated registration row (Date is empty)
        if (!rDate && !rTimeIn) {
          placeholderRowIndex = rowIndex;
          continue;
        }

        // Check if trainee already has a record for TODAY
        if (rDate === today) {
          if (rTimeOut) {
            return reply({
              status: 'already_completed',
              id: id,
              name: t.name,
              message: 'Attendance already completed for today.'
            });
          }

          if (!isTimeOutAllowed(hour, body.allowAnyTime === true)) {
            const message = hour < TIME_OUT_START
              ? 'Not Time out yet'
              : 'The Time Out window has ended. Time Out is available until 10:00 PM.';
            return reply({
              status: hour < TIME_OUT_START ? 'not_time_out' : 'time_window',
              id: id,
              name: t.name,
              message: message
            });
          }

          sh.getRange(rowIndex, 5).setNumberFormat('@').setValue(stamp);
          return reply({
            status: 'time_out',
            id: id,
            name: t.name,
            time: stamp
          });
        }
      }
    }

    if (body.restrictedTimeWindow === true && !isWithinTimeInWindow(hour)) {
      return reply({
        status: 'time_window',
        message: 'Time In can only be recorded from 7:00 AM to 3:00 PM.'
      });
    }

    if (placeholderRowIndex > 0) {
      sh.getRange(placeholderRowIndex, 3, 1, 3).setNumberFormat('@').setValues([[today, stamp, '']]);
      return reply({
        status: 'time_in',
        id: id,
        name: t.name,
        time: stamp,
        date: today
      });
    }

    const newRow = last + 1;
    sh.getRange(newRow, 1).setNumberFormat('@').setValue(id);
    sh.getRange(newRow, 2).setValue(t.name);
    sh.getRange(newRow, 3, 1, 3).setNumberFormat('@').setValues([[today, stamp, '']]);

    return reply({
      status: 'time_in',
      id: id,
      name: t.name,
      time: stamp,
      date: today
    });
  };

  return lockAlreadyHeld ? recordAttendance() : withScriptLock(recordAttendance);
}

function nextId(body) {
  const qp = String(body.qualification || '').trim();
  if (!QUALIFICATIONS[qp]) return reply({ status: 'error', message: 'Invalid qualification.' });
  return reply({ status: 'ok', id: getNextId(qp), qualification: QUALIFICATIONS[qp] });
}

function getTrainee(body) {
  const id = String(body.id || '').trim();
  const t = findTrainee(id);
  if (t) return reply({ status: 'ok', id: t.id, name: t.name, qualification: t.qualification });
  return reply({ status: 'not_found', id: id });
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActive();
    const tz = ss.getSpreadsheetTimeZone();
    const parameters = (e && e.parameter) || {};
    const action = String(parameters.action || '');
    const records = [];
    const matchingRecords = [];
    const traineesMap = {};
    const dateCounts = {};
    const qualificationTrainees = {};
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    let todayAttendance = 0;
    let totalRecords = 0;
    let recordOrder = 0;

    const requestedQualification = String(parameters.qualification || '').trim();
    if (requestedQualification && !QUALIFICATIONS[requestedQualification]) {
      return reply({ status: 'error', message: 'Invalid qualification.', records: [], trainees: [] });
    }

    const filterDate = String(parameters.date || '').trim();
    const rawFilterQualification = String(parameters.filterQualification || '').trim();
    const filterQualification = normalizeQualificationName(rawFilterQualification);
    const search = normalizeSearchText(parameters.search);
    const searchTerms = search ? search.split(' ').filter(Boolean) : [];
    if (action === 'records' && filterDate && !/^\d{4}-\d{2}-\d{2}$/.test(filterDate)) {
      return reply({ status: 'error', message: 'Invalid date filter.', records: [] });
    }
    if (rawFilterQualification && !filterQualification) {
      return reply({ status: 'error', message: 'Invalid qualification filter.', records: [] });
    }

    const page = Number(parameters.page || 1);
    const pageSize = Number(parameters.pageSize || 50);
    if (action === 'records' &&
        (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) {
      return reply({ status: 'error', message: 'Invalid pagination parameters.', records: [] });
    }

    for (const [prefix, qualName] of Object.entries(QUALIFICATIONS)) {
      if (requestedQualification && prefix !== requestedQualification) continue;
      const sh = ss.getSheetByName(qualName);
      if (!sh) continue;

      const last = sh.getLastRow();
      if (last <= 1) continue;

      const rows = sh.getRange(2, 1, last - 1, 5).getValues();
      for (let i = 0; i < rows.length; i++) {
        const rId = String(rows[i][0]).trim();
        const rName = String(rows[i][1]).trim();
        const rDate = text(rows[i][2], tz);
        const rTimeIn = (rows[i][3] && String(rows[i][3]).trim()) ? text(rows[i][3], tz, 'hh:mm a') : '';
        const rTimeOut = (rows[i][4] && String(rows[i][4]).trim()) ? text(rows[i][4], tz, 'hh:mm a') : '';

        if (!rId) continue;

        if (rName && !traineesMap[rId]) {
          traineesMap[rId] = { id: rId, name: rName, qualification: qualName };
        }

        if (rDate && rTimeIn) {
          const record = {
            id: rId,
            name: rName,
            qualification: qualName,
            date: rDate,
            timeIn: rTimeIn,
            timeOut: rTimeOut
          };
          if (action !== 'records') records.push(record);
          totalRecords++;
          dateCounts[rDate] = (dateCounts[rDate] || 0) + 1;
          if (rDate === today) todayAttendance++;
          if (!qualificationTrainees[qualName]) qualificationTrainees[qualName] = {};
          qualificationTrainees[qualName][rId] = true;

          if (action === 'records') {
            const matchesDate = !filterDate || rDate === filterDate;
            const matchesQualification = !filterQualification || qualName === filterQualification;
            const normalizedId = normalizeSearchText(rId);
            const normalizedName = normalizeSearchText(rName);
            const matchesSearch = !search || 
              normalizedId.includes(search) || 
              normalizedName.includes(search) ||
              searchTerms.every(function(term) {
                return normalizedId.includes(term) || normalizedName.includes(term);
            });
            if (matchesDate && matchesQualification && matchesSearch) {
              matchingRecords.push({ record: record, order: recordOrder });
            }
          }
          recordOrder++;
        }
      }
    }

    if (action === 'records') {
      matchingRecords.sort(function(a, b) {
        return b.record.date.localeCompare(a.record.date) || b.order - a.order;
      });

      const totalFilteredRecords = matchingRecords.length;
      const start = (page - 1) * pageSize;
      const pagedRecords = matchingRecords.slice(start, start + pageSize)
        .map(function(entry) { return entry.record; });
      const qualificationCounts = {};
      for (const [qualification, ids] of Object.entries(qualificationTrainees)) {
        qualificationCounts[qualification] = Object.keys(ids).length;
      }

      return reply({
        status: 'ok',
        records: pagedRecords,
        pagination: {
          page: page,
          pageSize: pageSize,
          total: totalFilteredRecords,
          totalPages: Math.ceil(totalFilteredRecords / pageSize)
        },
        summary: {
          totalTrainees: Object.keys(traineesMap).length,
          todayAttendance: todayAttendance,
          totalRecords: totalRecords,
          dateCounts: dateCounts,
          qualificationCounts: qualificationCounts
        }
      });
    }

    const trainees = Object.values(traineesMap).sort(function(a, b) {
      return a.id.localeCompare(b.id);
    });

    return reply({
      status: 'ok',
      records: records,
      trainees: trainees
    });
  } catch (err) {
    return reply({ status: 'error', message: String(err), records: [], trainees: [] });
  }
}
