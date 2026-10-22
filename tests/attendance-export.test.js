const assert = require('node:assert/strict');
const test = require('node:test');

const JSZip = require('../back-end/lib/jszip.min.js');
const AttendanceExport = require('../back-end/js/attendance-export');
const roster = require('../assets/trainee-roster.json');

test('JSON roster uses its names and assigns attendance statuses by trainee ID', () => {
  const eimRoster = roster.filter((trainee) => trainee.id.startsWith('4'));
  const regularTrainees = eimRoster.filter((trainee) => !trainee.id.endsWith('6666'));

  assert.equal(roster.length, 400);
  assert.equal(eimRoster.length, 30);

  const rows = AttendanceExport.buildAttendanceRows(roster, [
    { id: regularTrainees[0].id, timeOut: '04:00 PM', name: 'Name from Google Sheets' },
    { id: regularTrainees[1].id, timeOut: '' },
    { id: regularTrainees[1].id, timeOut: '04:00 PM' },
    { id: regularTrainees[2].id, timeOut: '' }
  ], 'EIM');

  assert.equal(rows.find((row) => row.id === regularTrainees[0].id).name, regularTrainees[0].name);
  assert.equal(rows.find((row) => row.id === regularTrainees[0].id).status, 'Attended');
  assert.equal(rows.find((row) => row.id === regularTrainees[1].id).status, 'Attended');
  assert.equal(rows.find((row) => row.id === regularTrainees[2].id).status, "Didn't time out");
  assert.equal(rows.find((row) => row.id.endsWith('6666')).status, 'No trainee ID found');
  assert.equal(rows.find((row) => row.id === regularTrainees[3].id).status, 'Absent');
});

test('placeholder roster entry matches a last-name-only attendance name to the real ID', () => {
  const placeholder = roster.find((trainee) => trainee.id === '36666' && trainee.name.startsWith('MANTONG'));
  const rows = AttendanceExport.buildAttendanceRows(roster, [
    {
      id: '30069',
      name: 'Mantong',
      timeOut: '04:00 PM'
    }
  ], 'CSS');
  const matched = rows.find((row) => row.name === placeholder.name);

  assert.deepEqual(matched, {
    id: '30069',
    name: placeholder.name,
    status: 'Attended'
  });
});

test('placeholder roster entry matches a one-character surname typo', () => {
  const placeholder = roster.find((trainee) => trainee.id === '36666' && trainee.name.startsWith('MANTONG'));
  const rows = AttendanceExport.buildAttendanceRows(roster, [
    { id: '30069', name: 'MANTON', timeOut: '' }
  ], 'CSS');
  const matched = rows.find((row) => row.name === placeholder.name);

  assert.deepEqual(matched, {
    id: '30069',
    name: placeholder.name,
    status: "Didn't time out"
  });
});

test('generated XLSX contains report rows and a distinct style for each status', async () => {
  const rows = [
    { id: '40001', name: 'Trainee & One', status: 'Attended' },
    { id: '40002', name: 'Trainee Two', status: "Didn't time out" },
    { id: '46666', name: 'Trainee Three', status: 'No trainee ID found' },
    { id: '40004', name: 'Trainee Four', status: 'Absent' }
  ];
  const blob = await AttendanceExport.createWorkbook(rows, JSZip);
  const generated = await JSZip.loadAsync(await blob.arrayBuffer());
  const worksheet = await generated.file('xl/worksheets/sheet1.xml').async('string');
  const styles = await generated.file('xl/styles.xml').async('string');

  assert.match(worksheet, /Trainee &amp; One/);
  assert.match(worksheet, /Didn&apos;t time out/);
  assert.match(worksheet, /No trainee ID found/);
  assert.match(worksheet, /s="2"/);
  assert.match(worksheet, /s="3"/);
  assert.match(worksheet, /s="4"/);
  assert.match(worksheet, /s="5"/);
  assert.match(styles, /FFFFE699/);
  assert.match(styles, /FFA9D18E/);
  assert.match(styles, /FFB4C7E7/);
  assert.match(styles, /FF1F4E78/);
});

test('attendance report rejects an unknown qualification', () => {
  assert.throws(
    () => AttendanceExport.buildAttendanceRows([], [], 'Unknown'),
    /Select a valid qualification/
  );
});
