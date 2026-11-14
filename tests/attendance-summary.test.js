const assert = require('node:assert/strict');
const test = require('node:test');
const { countAttendanceByTrainee } = require('../back-end/js/attendance-summary');

test('counts distinct attended dates per trainee', () => {
  const counts = countAttendanceByTrainee([
    { id: '10066', name: 'John Vincent A. Abanis', date: '2026-11-11', timeIn: '08:40 AM' },
    { id: '10066', name: 'John Vincent A. Abanis', date: '2026-11-11', timeIn: '08:41 AM' },
    { id: '10066', name: 'John Vincent A. Abanis', date: '2026-11-10', timeIn: '08:22 AM' },
    { id: '10067', name: 'Another Trainee', date: '2026-11-11', timeIn: '08:30 AM' }
  ]);

  assert.equal(counts['10066'], 2);
  assert.equal(counts['10067'], 1);
  assert.equal(counts['john vincent a abanis'], 2);
});

test('ignores attendance rows without a trainee ID or date', () => {
  const counts = countAttendanceByTrainee([
    { id: '10066', date: '' },
    { id: '', date: '2026-11-11' },
    { date: '2026-11-11' }
  ]);

  assert.deepEqual(Object.keys(counts), []);
});
