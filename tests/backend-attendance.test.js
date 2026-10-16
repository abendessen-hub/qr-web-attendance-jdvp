const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadBackend(sheet) {
  const output = { content: '' };
  const lockState = { acquired: 0, released: 0 };
  const spreadsheet = {
    getSheetByName(name) {
      return name === 'EIM' ? sheet : null;
    },
    getSpreadsheetTimeZone() {
      return 'UTC';
    }
  };
  const context = {
    SpreadsheetApp: { getActive: () => spreadsheet },
    LockService: {
      getScriptLock() {
        return {
          waitLock() {
            lockState.acquired++;
          },
          releaseLock() {
            lockState.released++;
          }
        };
      }
    },
    Utilities: {
      formatDate(_date, _timezone, format) {
        if (format === 'yyyy-MM-dd') return '2026-10-14';
        if (format === 'HH') return '09';
        return '09:15 AM';
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        output.content = content;
        return { setMimeType() { return this; } };
      }
    },
    module: { exports: {} }
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8');
  vm.runInNewContext(
    source + '\nmodule.exports = { doGet, doPost, findTrainee, normalizeQualificationName, recordScan };',
    context
  );
  return {
    doGet: context.module.exports.doGet,
    doPost: context.module.exports.doPost,
    findTrainee: context.module.exports.findTrainee,
    normalizeQualificationName: context.module.exports.normalizeQualificationName,
    recordScan: context.module.exports.recordScan,
    lockState,
    output
  };
}

function createSheet(initialRows) {
  const rows = [['Trainee ID', 'Name', 'Date', 'Time In', 'Time Out'], ...initialRows];
  const requestedRanges = [];

  function range(row, column, numRows = 1, numColumns = 1) {
    requestedRanges.push({ row, column, numRows, numColumns });
    while (rows.length < row - 1 + numRows) {
      rows.push(['', '', '', '', '']);
    }
    return {
      getRow: () => row,
      getValue: () => rows[row - 1][column - 1],
      getValues() {
        return rows.slice(row - 1, row - 1 + numRows)
          .map((values) => values.slice(column - 1, column - 1 + numColumns));
      },
      createTextFinder(query) {
        let entireCell = false;
        return {
          matchEntireCell(value) {
            entireCell = value;
            return this;
          },
          findNext() {
            return findMatches(query, entireCell)[0] || null;
          },
          findAll() {
            return findMatches(query, entireCell);
          }
        };
      },
      setNumberFormat() {
        return this;
      },
      setValue(value) {
        rows[row - 1][column - 1] = value;
        return this;
      },
      setValues(values) {
        for (let r = 0; r < values.length; r++) {
          for (let c = 0; c < values[r].length; c++) {
            rows[row - 1 + r][column - 1 + c] = values[r][c];
          }
        }
        return this;
      }
    };
  }

  function findMatches(query, entireCell) {
    const matches = [];
    for (let row = 2; row <= rows.length; row++) {
      const value = String(rows[row - 1][0] || '');
      if (entireCell ? value === query : value.includes(query)) {
        matches.push({ getRow: () => row });
      }
    }
    return matches;
  }

  return {
    getLastRow: () => rows.length,
    getRange: range,
    rows,
    requestedRanges
  };
}

test('read-only POST actions do not acquire the write lock and registration releases it', () => {
  const sheet = createSheet([
    ['40004', 'Trainee Four', '2026-10-13', '09:00 AM', '']
  ]);
  const { doPost, lockState, output } = loadBackend(sheet);

  doPost({ postData: { contents: JSON.stringify({ action: 'getTrainee', id: '40004' }) } });
  assert.equal(JSON.parse(output.content).status, 'ok');
  assert.deepEqual(lockState, { acquired: 0, released: 0 });

  doPost({
    postData: {
      contents: JSON.stringify({
        action: 'register',
        id: '40005',
        name: 'Trainee Five',
        qualification: '4'
      })
    }
  });
  assert.deepEqual(JSON.parse(output.content), {
    status: 'ok',
    id: '40005',
    name: 'Trainee Five',
    qualification: 'EIM'
  });
  assert.deepEqual(lockState, { acquired: 1, released: 1 });
  assert.deepEqual(sheet.rows[2], ['40005', 'Trainee Five', '', '', '']);

  doPost({
    postData: {
      contents: JSON.stringify({
        action: 'scan',
        id: '40004',
        restrictedTimeWindow: true
      })
    }
  });
  assert.equal(JSON.parse(output.content).status, 'time_in');
  assert.deepEqual(lockState, { acquired: 2, released: 2 });
});

test('doGet returns a filtered page while keeping complete attendance summaries', () => {
  const sheet = createSheet([
    ['40001', 'Juan   Dela Cruz', '2026-10-13', '08:00 AM', ''],
    ['40002', 'Trainee Two', '2026-10-14', '09:00 AM', ''],
    ['40003', 'Trainee Three', '', '', '']
  ]);
  const { doGet, output } = loadBackend(sheet);

  doGet({ parameter: { action: 'records', page: '2', pageSize: '1' } });

  let data = JSON.parse(output.content);
  assert.equal(data.status, 'ok');
  assert.deepEqual(data.records, [{
    id: '40001',
    name: 'Juan   Dela Cruz',
    qualification: 'EIM',
    date: '2026-10-13',
    timeIn: '08:00 AM',
    timeOut: ''
  }]);
  assert.deepEqual(data.pagination, { page: 2, pageSize: 1, total: 2, totalPages: 2 });
  assert.deepEqual(data.summary, {
    totalTrainees: 3,
    todayAttendance: 1,
    totalRecords: 2,
    dateCounts: { '2026-10-13': 1, '2026-10-14': 1 },
    qualificationCounts: { EIM: 2 }
  });

  doGet({
    parameter: {
      action: 'records',
      page: '1',
      pageSize: '1',
      search: '40002'
    }
  });
  data = JSON.parse(output.content);
  assert.deepEqual(data.records.map((record) => record.id), ['40002']);
  assert.deepEqual(data.pagination, { page: 1, pageSize: 1, total: 1, totalPages: 1 });
  assert.equal(data.summary.totalRecords, 2);

  doGet({
    parameter: {
      action: 'records',
      page: '1',
      pageSize: '50',
      search: 'Juan Dela Cruz'
    }
  });
  data = JSON.parse(output.content);
  assert.deepEqual(data.records.map((record) => record.id), ['40001']);
  assert.equal(data.pagination.total, 1);

  doGet({
    parameter: {
      action: 'records',
      page: '1',
      pageSize: '50',
      date: '2026-10-13',
      filterQualification: 'EIM'
    }
  });
  data = JSON.parse(output.content);
  assert.deepEqual(data.records.map((record) => record.id), ['40001']);
  assert.equal(data.pagination.total, 1);

  doGet({ parameter: {} });
  data = JSON.parse(output.content);
  assert.equal(data.records.length, 2);
  assert.equal(data.trainees.length, 3);
});

test('findTrainee returns exact 5-digit IDs and still supports 4-digit badges efficiently', () => {
  const history = Array.from({ length: 100 }, () => [
    '40004',
    'Trainee Four',
    '2026-10-13',
    '09:00 AM',
    ''
  ]);
  const sheet = createSheet(history);
  const { findTrainee } = loadBackend(sheet);

  assert.deepEqual({ ...findTrainee('40004') }, {
    id: '40004',
    name: 'Trainee Four',
    qualification: 'EIM'
  });
  assert.equal(
    sheet.requestedRanges.some((requested) => requested.numRows > 1 && requested.numColumns > 1),
    false
  );

  sheet.requestedRanges.length = 0;
  assert.deepEqual({ ...findTrainee('0004') }, {
    id: '40004',
    name: 'Trainee Four',
    qualification: 'EIM'
  });
  assert.equal(
    sheet.requestedRanges.some((requested) => requested.numRows > 1 && requested.numColumns > 1),
    false
  );
});

test('a trainee with only a previous-day record gets today recorded and confirmed', () => {
  const history = Array.from({ length: 100 }, (_, index) => [
    '40004',
    'Trainee Four',
    `2026-10-${String((index % 13) + 1).padStart(2, '0')}`,
    '09:00 AM',
    ''
  ]);
  const sheet = createSheet(history);
  const { recordScan, output } = loadBackend(sheet);

  recordScan({ id: '40004', restrictedTimeWindow: true });

  assert.deepEqual(JSON.parse(output.content), {
    status: 'time_in',
    id: '40004',
    name: 'Trainee Four',
    time: '09:15 AM',
    date: '2026-10-14'
  });
  assert.deepEqual(sheet.rows[101], ['40004', 'Trainee Four', '2026-10-14', '09:15 AM', '']);
  assert.equal(
    sheet.requestedRanges.some((requested) =>
      requested.numRows > 1 && requested.column === 1 && requested.numColumns === 5
    ),
    false
  );
});

test('scans for separate registered trainees do not hold the script lock', () => {
  const sheet = createSheet([
    ['40001', 'Trainee One', '', '', ''],
    ['40002', 'Trainee Two', '', '', '']
  ]);
  const { recordScan, lockState, output } = loadBackend(sheet);

  recordScan({ id: '40001', restrictedTimeWindow: true });
  assert.equal(JSON.parse(output.content).status, 'time_in');
  recordScan({ id: '40002', restrictedTimeWindow: true });

  assert.equal(JSON.parse(output.content).status, 'time_in');
  assert.deepEqual(lockState, { acquired: 0, released: 0 });
  assert.deepEqual(sheet.rows[1], ['40001', 'Trainee One', '2026-10-14', '09:15 AM', '']);
  assert.deepEqual(sheet.rows[2], ['40002', 'Trainee Two', '2026-10-14', '09:15 AM', '']);
});

test('qualification filters normalize case and plus-encoded spaces', () => {
  const { normalizeQualificationName } = loadBackend(createSheet([]));
  assert.equal(normalizeQualificationName('house+keeping'), 'House Keeping');
  assert.equal(normalizeQualificationName(' House   Keeping '), 'House Keeping');
  assert.equal(normalizeQualificationName('Unknown Qualification'), '');
});

test('searching by a trainee full name returns the attendance record', () => {
  const sheet = createSheet([
    ['10001', 'Juan Dela Cruz', '2026-10-14', '09:15 AM', ''],
    ['10001', 'Juan Dela\u200BCruz', '2026-10-13', '09:15 AM', ''],
    ['10002', 'Juan Carlos Reyes', '2026-10-14', '09:20 AM', '']
  ]);
  const { doGet, output } = loadBackend(sheet);

  doGet({
    parameter: {
      action: 'records',
      page: '1',
      pageSize: '50',
      search: 'Juan Dela Cruz'
    }
  });

  let data = JSON.parse(output.content);
  assert.equal(data.status, 'ok');
  assert.deepEqual(data.records.map((record) => record.id), ['10001', '10001']);
  assert.equal(data.pagination.total, 2);

  doGet({
    parameter: {
      action: 'records',
      page: '1',
      pageSize: '50',
      search: 'Juan'
    }
  });
  data = JSON.parse(output.content);
  assert.deepEqual(data.records.map((record) => record.id), ['10002', '10001', '10001']);
  assert.equal(data.pagination.total, 3);
});

test('searching names ignores accents and punctuation differences', () => {
  const sheet = createSheet([
    ['10003', 'José O’Neil', '2026-10-14', '09:15 AM', ''],
    ['10004', 'María Dela-Cruz', '2026-10-14', '09:20 AM', '']
  ]);
  const { doGet, output } = loadBackend(sheet);

  for (const [search, expectedId] of [
    ['Jose', '10003'],
    ['Jose O Neil', '10003'],
    ['Maria Dela Cruz', '10004']
  ]) {
    doGet({
      parameter: {
        action: 'records',
        page: '1',
        pageSize: '50',
        search
      }
    });
    const data = JSON.parse(output.content);
    assert.equal(data.status, 'ok');
    assert.deepEqual(data.records.map((record) => record.id), [expectedId]);
    assert.equal(data.pagination.total, 1);
  }
});