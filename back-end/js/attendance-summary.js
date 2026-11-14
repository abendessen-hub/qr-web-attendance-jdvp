(function (root) {
  'use strict';

  function buildRosterAttendanceSummary(roster, records, buildAttendanceRows) {
    const sessions = Object.create(null);
    const traineeDates = Object.create(null);
    const attendedByDate = Object.create(null);
    const resolvedIds = Object.create(null);
    const datesByQualification = Object.create(null);
    const studentCountsByQualificationDate = Object.create(null);

    records.forEach(function (record) {
      const qualification = String(record.qualification || '').trim();
      const date = String(record.date || '').trim();
      if (!qualification || !date || !String(record.id || '').trim()) return;

      const sessionKey = qualification + '\n' + date;
      if (!sessions[sessionKey]) {
        sessions[sessionKey] = { qualification: qualification, date: date, records: [] };
      }
      sessions[sessionKey].records.push(record);
    });

    Object.keys(sessions).forEach(function (sessionKey) {
      const session = sessions[sessionKey];
      if (!datesByQualification[session.qualification]) {
        datesByQualification[session.qualification] = new Set();
      }
      datesByQualification[session.qualification].add(session.date);
      if (!studentCountsByQualificationDate[session.qualification]) {
        studentCountsByQualificationDate[session.qualification] = Object.create(null);
      }
      const qualificationRoster = roster.filter(function (trainee) {
        return trainee.qualification === session.qualification;
      });
      if (!qualificationRoster.length) return;

      const rows = buildAttendanceRows(roster, session.records, session.qualification);
      if (rows.length !== qualificationRoster.length) {
        throw new Error('Attendance rows could not be matched to the trainee roster.');
      }

      rows.forEach(function (row, index) {
        if (row.status !== 'Attended' && row.status !== "Didn't time out") return;
        const trainee = qualificationRoster[index];
        const rosterKey = trainee.rosterKey || trainee.id + ':' + index;
        if (!traineeDates[rosterKey]) traineeDates[rosterKey] = new Set();
        traineeDates[rosterKey].add(session.date);
        if (!attendedByDate[session.date]) attendedByDate[session.date] = new Set();
        attendedByDate[session.date].add(rosterKey);
        studentCountsByQualificationDate[session.qualification][session.date] =
          (studentCountsByQualificationDate[session.qualification][session.date] || 0) + 1;
        if (!resolvedIds[rosterKey]) resolvedIds[rosterKey] = row.id;
      });
    });

    const counts = Object.create(null);
    Object.keys(traineeDates).forEach(function (id) {
      counts[id] = traineeDates[id].size;
    });
    const sessionDatesByQualification = Object.create(null);
    Object.keys(datesByQualification).forEach(function (qualification) {
      sessionDatesByQualification[qualification] = Array.from(datesByQualification[qualification]).sort();
    });
    return {
      counts: counts,
      attendedByDate: attendedByDate,
      resolvedIds: resolvedIds,
      sessionDatesByQualification: sessionDatesByQualification,
      studentCountsByQualificationDate: studentCountsByQualificationDate
    };
  }

  const api = { buildRosterAttendanceSummary: buildRosterAttendanceSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AttendanceSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
