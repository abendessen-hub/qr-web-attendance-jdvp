/**
 * JDVP Attendance Backend — Luis Y. Ferrer Jr. Senior High School
 * Section: ICT-CP 12-KOTLIN
 *
 * Exactly 6 Sheets/tabs — one for each qualification:
 * 1. Cookery
 * 2. House Keeping
 * 3. CSS
 * 4. EIM
 * 5. SMAW NC I
 * 6. SMAW NC II
 *
 * Each sheet contains EXACTLY these 5 columns:
 * Trainee ID | Name | Date | Time In | Time Out
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
  '5': 'SMAW NC I',
  '6': 'SMAW NC II'
};

const TIME_OUT_START = 15; // 3:00 PM (24-hour format)
const TIME_OUT_END = 17;   // 5:00 PM (24-hour format)

/* ═══════════════════════════════════════════
   One-time setup — creates EXACTLY the 6 tabs
   ═══════════════════════════════════════════ */
function setup() {
  const ss = SpreadsheetApp.getActive();

  for (const name of Object.values(QUALIFICATIONS)) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    
    // Exact 5 columns as required
    sh.getRange('A1:E1')
      .setValues([['Trainee ID', 'Name', 'Date', 'Time In', 'Time Out']])
      .setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@'); // text format preserves leading digits
    sh.getRange('C:E').setNumberFormat('@');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 110);
    sh.setColumnWidth(2, 200);
    sh.setColumnWidth(3, 120);
    sh.setColumnWidth(4, 110);
    sh.setColumnWidth(5, 110);
  }
}

/* ═══════════════════════════════════════════
   Helpers (Operating directly on the 6 sheets)
   ═══════════════════════════════════════════ */

function qualFromId(id) {
  const prefix = String(id).charAt(0);
  return QUALIFICATIONS[prefix] || null;
}

// Scans ONLY that qualification's sheet to find the next sequential ID
function getNextId(qualPrefix) {
  const qualName = QUALIFICATIONS[qualPrefix];
  if (!qualName) return null;

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(qualName);
  if (!sh) return String(parseInt(qualPrefix, 10) * 10000 + 1);

  const last = sh.getLastRow();
  const base = parseInt(qualPrefix, 10) * 10000; // e.g. 10000, 20000, 60000
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

  return String(max + 1); // e.g. 10001, 10002... 60001, 60002...
}

// Looks up a trainee in their specific qualification sheet
function findTrainee(id) {
  const qualName = qualFromId(id);
  if (!qualName) return null;

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(qualName);
  if (!sh) return null;

  const last = sh.getLastRow();
  if (last <= 1) return null;

  const rows = sh.getRange(2, 1, last - 1, 2).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(id).trim()) {
      return {
        id: String(id).trim(),
        name: String(rows[i][1]).trim(),
        qualification: qualName
      };
    }
  }

  return null;
}

function text(v, tz, p) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, p || 'yyyy-MM-dd');
  return String(v || '');
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════
   POST Dispatcher
   ═══════════════════════════════════════════ */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
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
  } finally {
    lock.releaseLock();
  }
}

/* ── Register a trainee into their qualification sheet ── */
function registerTrainee(body) {
  const name = String(body.name || '').trim();
  const qp   = String(body.qualification || '').trim();
  if (!name) return reply({ status: 'error', message: 'Name is required.' });
  if (!QUALIFICATIONS[qp]) return reply({ status: 'error', message: 'Invalid qualification.' });

  const qualName = QUALIFICATIONS[qp];
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(qualName);
  if (!sh) {
    setup();
    sh = ss.getSheetByName(qualName);
  }

  const id = getNextId(qp);

  // Save trainee record directly into their qualification sheet
  // (Empty Date/Time In/Time Out until their first attendance scan)
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1).setNumberFormat('@').setValue(id);
  sh.getRange(row, 2).setValue(name);
  sh.getRange(row, 3, 1, 3).setNumberFormat('@').setValues([['', '', '']]);

  return reply({ status: 'ok', id: id, name: name, qualification: qualName });
}

/* ── Scan Attendance: Time In & Time Out ── */
function recordScan(body) {
  const id = String(body.id || '').trim();
  const qualName = qualFromId(id);
  if (!qualName) return reply({ status: 'invalid', message: 'Invalid ID prefix.' });

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(qualName);
  if (!sh) return reply({ status: 'not_registered', id: id });

  const t = findTrainee(id);
  if (!t) return reply({ status: 'not_registered', id: id });

  const tz    = ss.getSpreadsheetTimeZone();
  const now   = new Date();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const hour  = parseInt(Utilities.formatDate(now, tz, 'HH'), 10);
  const stamp = Utilities.formatDate(now, tz, 'hh:mm a');

  const last = sh.getLastRow();
  let placeholderRowIndex = -1;

  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, 5).getValues();

    for (let i = 0; i < rows.length; i++) {
      const rId = String(rows[i][0]).trim();
      if (rId !== id) continue;

      const rDate = text(rows[i][2], tz);
      const rTimeIn = String(rows[i][3]).trim();
      const rTimeOut = String(rows[i][4]).trim();

      // Check if there is an unactivated registration row (Date is empty)
      if (!rDate && !rTimeIn) {
        placeholderRowIndex = i + 2;
        continue;
      }

      // Check if trainee already has a record for TODAY
      if (rDate === today) {
        // 1. Both Time In and Time Out already completed
        if (rTimeOut) {
          return reply({
            status: 'already_completed',
            id: id,
            name: t.name,
            message: 'Attendance already completed for today.'
          });
        }

        // 2. Before 3:00 PM -> Not time out yet
        if (hour < TIME_OUT_START) {
          return reply({
            status: 'not_time_out',
            id: id,
            name: t.name,
            message: 'Not Time out yet'
          });
        }

        // 3. Between 3:00 PM and 5:00 PM (or afternoon) -> Record Time Out
        sh.getRange(i + 2, 5).setNumberFormat('@').setValue(stamp);
        return reply({
          status: 'time_out',
          id: id,
          name: t.name,
          time: stamp
        });
      }
    }
  }

  // If a pre-registered row with empty date exists, activate it with today's Time In
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

  // Otherwise, append a new attendance row for today
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
}

/* ── Next ID query ── */
function nextId(body) {
  const qp = String(body.qualification || '').trim();
  if (!QUALIFICATIONS[qp]) return reply({ status: 'error', message: 'Invalid qualification.' });
  return reply({ status: 'ok', id: getNextId(qp), qualification: QUALIFICATIONS[qp] });
}

/* ── Trainee lookup ── */
function getTrainee(body) {
  const id = String(body.id || '').trim();
  const t = findTrainee(id);
  if (t) return reply({ status: 'ok', id: t.id, name: t.name, qualification: t.qualification });
  return reply({ status: 'not_found', id: id });
}

/* ═══════════════════════════════════════════
   GET: Read from the 6 Qualification Sheets
   ═══════════════════════════════════════════ */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActive();
    const tz = ss.getSpreadsheetTimeZone();
    const records = [];
    const traineesMap = {}; // { id: { id, name, qualification } }

    // Read directly from each of the 6 qualification sheets
    for (const qualName of Object.values(QUALIFICATIONS)) {
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

        // Collect registered trainees
        if (rName && !traineesMap[rId]) {
          traineesMap[rId] = { id: rId, name: rName, qualification: qualName };
        }

        // Only include in attendance records if Date and Time In are present
        if (rDate && rTimeIn) {
          records.push({
            id: rId,
            name: rName,
            qualification: qualName,
            date: rDate,
            timeIn: rTimeIn,
            timeOut: rTimeOut
          });
        }
      }
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
