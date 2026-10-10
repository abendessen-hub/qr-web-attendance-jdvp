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
  '5': 'SMAW NC I',
  '6': 'SMAW NC II'
};

const TIME_OUT_START = 15; // 3:00 PM (24-hour format)
const TIME_OUT_END = 17;   // 5:00 PM (24-hour format)

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

  // 1. If 5-digit Trainee ID (e.g. 60001)
  if (textCode.length === 5) {
    const qualName = qualFromId(textCode);
    if (!qualName) return null;
    const sh = ss.getSheetByName(qualName);
    if (!sh) return null;
    const last = sh.getLastRow();
    if (last <= 1) return null;

    const rows = sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === textCode) {
        return {
          id: textCode,
          name: String(rows[i][1]).trim(),
          qualification: qualName
        };
      }
    }
    return null;
  }

  // 2. If 4-digit badge (e.g. 0001) -> check all 6 sheets for matching Q + 0001
  if (textCode.length === 4) {
    for (const [prefix, qualName] of Object.entries(QUALIFICATIONS)) {
      const sh = ss.getSheetByName(qualName);
      if (!sh) continue;
      const last = sh.getLastRow();
      if (last <= 1) continue;

      const target5 = prefix + textCode; // e.g. 60001
      const rows = sh.getRange(2, 1, last - 1, 2).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === target5) {
          return {
            id: target5,
            name: String(rows[i][1]).trim(),
            qualification: qualName
          };
        }
      }
    }
    return null;
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

// Registers a trainee into their qualification sheet (using QNNNN)
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

  let id = body.id ? String(body.id).trim() : null;
  if (id && (!/^[1-6]\d{4}$/.test(id) || id.charAt(0) !== qp)) {
    return reply({ status: 'error', message: 'Trainee ID does not match the selected qualification.' });
  }
  if (!id) {
    id = getNextId(qp);
  }

  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1).setNumberFormat('@').setValue(id);
  sh.getRange(row, 2).setValue(name);
  sh.getRange(row, 3, 1, 3).setNumberFormat('@').setValues([['', '', '']]);

  return reply({ status: 'ok', id: id, name: name, qualification: qualName });
}

// Scans attendance for either 4-digit badge or 5-digit Trainee ID
function recordScan(body) {
  const code = String(body.id || '').trim();
  const t = findTrainee(code);

  // If badge or ID is not registered yet
  if (!t) {
    const badge4 = code.length === 4 ? code : (code.length === 5 ? code.slice(-4) : code);
    return reply({
      status: 'not_registered',
      id: code,
      badge: badge4
    });
  }

  const id = t.id; // full 5-digit ID (e.g. 60001)
  const qualName = t.qualification;
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(qualName);
  if (!sh) return reply({ status: 'not_registered', id: id, badge: id.slice(-4) });

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
        if (rTimeOut) {
          return reply({
            status: 'already_completed',
            id: id,
            name: t.name,
            message: 'Attendance already completed for today.'
          });
        }

        if (hour < TIME_OUT_START) {
          return reply({
            status: 'not_time_out',
            id: id,
            name: t.name,
            message: 'Not Time out yet'
          });
        }

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
    const records = [];
    const traineesMap = {};

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

        if (rName && !traineesMap[rId]) {
          traineesMap[rId] = { id: rId, name: rName, qualification: qualName };
        }

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
