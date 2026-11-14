(function (root) {
  'use strict';

  function countAttendanceByTrainee(records) {
    const datesByTrainee = Object.create(null);

    records.forEach(function (record) {
      const id = String(record.id || '').trim();
      const date = String(record.date || '').trim();
      if (!id || !date) return;

      const name = String(record.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      [id, name].filter(Boolean).forEach(function (key) {
        if (!datesByTrainee[key]) datesByTrainee[key] = new Set();
        datesByTrainee[key].add(date);
      });
    });

    const counts = Object.create(null);
    Object.keys(datesByTrainee).forEach(function (id) {
      counts[id] = datesByTrainee[id].size;
    });
    return counts;
  }

  const api = { countAttendanceByTrainee: countAttendanceByTrainee };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AttendanceSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
