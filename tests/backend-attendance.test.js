const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadBackend(sheet) {
  const output = { content: '' };
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
  vm.runInNewContext(source + '\nmodule.exports = { recordScan };', context);
  return { recordScan: context.module.exports.recordScan, output };
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

test('a trainee with only a previous-day record gets today recorded and confirmed', () => {
  const sheet = createSheet([
    ['40004', 'Trainee Four', '2026-10-13', '09:00 AM', '']
  ]);
  const { recordScan, output } = loadBackend(sheet);

  recordScan({ id: '40004', restrictedTimeWindow: true });

  assert.deepEqual(JSON.parse(output.content), {
    status: 'time_in',
    id: '40004',
    name: 'Trainee Four',
    time: '09:15 AM',
    date: '2026-10-14'
  });
  assert.deepEqual(sheet.rows[2], ['40004', 'Trainee Four', '2026-10-14', '09:15 AM', '']);
  assert.equal(
    sheet.requestedRanges.some((requested) => requested.numRows > 1 && requested.numColumns > 1),
    false
  );
});
