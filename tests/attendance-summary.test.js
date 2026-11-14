const assert = require('node:assert/strict');
const test = require('node:test');
const AttendanceExport = require('../back-end/js/attendance-export');
const { buildRosterAttendanceSummary } = require('../back-end/js/attendance-summary');
const roster = require('../assets/trainee-roster.json');

function qualifiedRoster() {
  const qualifications = {
    '1': 'Cookery',
    '2': 'House Keeping',
    '3': 'CSS',
    '4': 'EIM',
    '5': 'SMAW NC I',
    '6': 'SMAW NC II'
  };
  return roster.map((trainee, index) => ({
    ...trainee,
    rosterKey: String(index) + ':' + trainee.id,
    qualification: qualifications[trainee.id.charAt(0)],
    qrCode: trainee.id.slice(-4)
  }));
}

test('counts distinct daily attendance when the recorded QR differs from the roster ID', () => {
  const trainees = qualifiedRoster();
  const trainee = trainees.find((entry) => entry.name === 'YAMAUCHI, YUUKI');
  const records = [
    { id: '10053', name: 'Yuko P. Yamauchi', qualification: 'Cookery', date: '2026-11-11', timeIn: '08:09 AM', timeOut: '04:23 PM' },
    { id: '10053', name: 'Yuko P. Yamauchi', qualification: 'Cookery', date: '2026-11-11', timeIn: '08:10 AM', timeOut: '04:24 PM' },
    { id: '10053', name: 'Yuko P. Yamauchi', qualification: 'Cookery', date: '2026-11-10', timeIn: '08:19 AM', timeOut: '03:43 PM' },
    { id: '10053', name: 'Yuko P. Yamauchi', qualification: 'Cookery', date: '2026-11-09', timeIn: '08:07 AM', timeOut: '04:21 PM' },
    { id: '10053', name: 'Yuko P. Yamauchi', qualification: 'Cookery', date: '2026-11-03', timeIn: '04:20 PM', timeOut: '' }
  ];
  const result = buildRosterAttendanceSummary(
    trainees,
    records,
    AttendanceExport.buildAttendanceRows
  );

  assert.equal(result.counts[trainee.rosterKey], 4);
  assert.equal(result.attendedByDate['2026-11-03'].has(trainee.rosterKey), true);
  assert.equal(result.resolvedIds[trainee.rosterKey], '10053');
  const anotherPlaceholder = trainees.find((entry) =>
    entry.id === '16666' && entry.rosterKey !== trainee.rosterKey
  );
  assert.equal(result.counts[anotherPlaceholder.rosterKey] || 0, 0);
  assert.deepEqual(result.sessionDatesByQualification.Cookery, [
    '2026-11-03',
    '2026-11-09',
    '2026-11-10',
    '2026-11-11'
  ]);
});

test('counts records using the exact roster ID and treats no-time-out as present', () => {
  const trainees = qualifiedRoster();
  const trainee = trainees.find((entry) => entry.id === '10001');
  const result = buildRosterAttendanceSummary(
    trainees,
    [{ id: '10001', name: trainee.name, qualification: 'Cookery', date: '2026-11-11', timeIn: '08:00 AM', timeOut: '' }],
    AttendanceExport.buildAttendanceRows
  );

  assert.equal(result.counts[trainee.rosterKey], 1);
  assert.equal(result.attendedByDate['2026-11-11'].has(trainee.rosterKey), true);
});
