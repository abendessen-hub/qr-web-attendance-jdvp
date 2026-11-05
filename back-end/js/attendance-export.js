(function (root) {
  'use strict';

  const QUALIFICATION_PREFIXES = {
    Cookery: '1',
    'House Keeping': '2',
    CSS: '3',
    EIM: '4',
    'SMAW NC I': '5',
    'SMAW NC II': '6'
  };

  function normalizeName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function editDistanceAtMostOne(left, right) {
    if (Math.abs(left.length - right.length) > 1) return false;
    let leftIndex = 0;
    let rightIndex = 0;
    let edits = 0;

    while (leftIndex < left.length && rightIndex < right.length) {
      if (left[leftIndex] === right[rightIndex]) {
        leftIndex++;
        rightIndex++;
      } else {
        if (++edits > 1) return false;
        if (left.length > right.length) leftIndex++;
        else if (right.length > left.length) rightIndex++;
        else {
          leftIndex++;
          rightIndex++;
        }
      }
    }

    return edits + (leftIndex < left.length || rightIndex < right.length ? 1 : 0) <= 1;
  }

  function nameMatchScore(rosterName, attendanceName) {
    const normalizedRosterName = normalizeName(rosterName);
    const normalizedAttendanceName = normalizeName(attendanceName);
    if (!normalizedRosterName || !normalizedAttendanceName) return 0;
    if (normalizedRosterName === normalizedAttendanceName) return 3;

    const surname = normalizeName(String(rosterName).split(',')[0]);
    const surnameTokens = surname.split(' ').filter((token) => token.length >= 4);
    const attendanceTokens = normalizedAttendanceName.split(' ');
    if (surnameTokens.some((token) => attendanceTokens.includes(token))) return 2;
    if (surnameTokens.some((token) => attendanceTokens.some((candidate) =>
      candidate.length >= 4 && editDistanceAtMostOne(token, candidate)
    ))) return 1;
    return 0;
  }

  function buildAttendanceRows(roster, records, qualification) {
    const prefix = QUALIFICATION_PREFIXES[qualification];
    if (!prefix) throw new Error('Select a valid qualification.');

    const attendanceById = new Map();
    records.forEach(function (record) {
      const id = String(record.id || '').trim();
      const current = attendanceById.get(id);
      if (id && (!current || record.timeOut)) attendanceById.set(id, record);
    });

    const qualificationRoster = roster.filter(function (trainee) {
      return trainee.id.charAt(0) === prefix;
    });
    const placeholders = qualificationRoster.filter((trainee) =>
      /^(?:[1-6]|X)6666$/i.test(trainee.id)
    );
    const placeholderMatches = new Map();
    const recordsById = Array.from(attendanceById, function (entry) {
      return { id: entry[0], record: entry[1] };
    }).filter((entry) =>
      !/^(?:[1-6]|X)6666$/i.test(entry.id) && entry.id.charAt(0) === prefix
    );

    recordsById.forEach(function (entry) {
      let bestScore = 0;
      let bestPlaceholder = null;
      let tied = false;

      placeholders.forEach(function (placeholder) {
        const score = nameMatchScore(placeholder.name, entry.record.name);
        if (score > bestScore) {
          bestScore = score;
          bestPlaceholder = placeholder;
          tied = false;
        } else if (score && score === bestScore) {
          tied = true;
        }
      });

      if (bestScore && !tied) {
        const matches = placeholderMatches.get(bestPlaceholder) || [];
        matches.push(entry);
        placeholderMatches.set(bestPlaceholder, matches);
      }
    });

    return qualificationRoster.map(function (trainee) {
      const noTraineeId = /^(?:[1-6]|X)6666$/i.test(trainee.id);
      let id = trainee.id;
      let attendance = attendanceById.get(id);
      if (noTraineeId) {
        const nameMatches = placeholderMatches.get(trainee) || [];
        if (nameMatches.length === 1) {
          id = nameMatches[0].id;
          attendance = nameMatches[0].record;
        }
      }
      let status = 'Absent';
      if (noTraineeId && id === trainee.id) status = 'No trainee ID found';
      else if (attendance) status = attendance.timeOut ? 'Attended' : "Didn't time out";
      return { id: id, name: trainee.name, status: status };
    });
  }

  function xmlEscape(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
      }[character];
    });
  }

  function cell(reference, value, style) {
    return '<c r="' + reference + '" t="inlineStr"' +
      (style ? ' s="' + style + '"' : '') +
      '><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
  }

  function worksheetXml(rows) {
    const headers = ['Trainee ID', 'Name', 'Status'];
    const sheetRows = [
      '<row r="1">' + headers.map(function (header, index) {
        return cell(String.fromCharCode(65 + index) + '1', header, 1);
      }).join('') + '</row>'
    ];
    const statusStyles = {
      'Absent': 2,
      "Didn't time out": 3,
      'Attended': 4,
      'No trainee ID found': 5
    };

    rows.forEach(function (row, index) {
      const rowNumber = index + 2;
      sheetRows.push('<row r="' + rowNumber + '">' +
        cell('A' + rowNumber, row.id) +
        cell('B' + rowNumber, row.name) +
        cell('C' + rowNumber, row.status, statusStyles[row.status] || 0) +
        '</row>');
    });

    const lastRow = rows.length + 1;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:C' + lastRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" ' +
      'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<cols><col min="1" max="1" width="16" customWidth="1"/>' +
      '<col min="2" max="2" width="42" customWidth="1"/>' +
      '<col min="3" max="3" width="24" customWidth="1"/></cols>' +
      '<sheetData>' + sheetRows.join('') + '</sheetData>' +
      '<autoFilter ref="A1:C' + lastRow + '"/></worksheet>';
  }

  async function createWorkbook(rows, zipLibrary) {
    const zip = new zipLibrary();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
    zip.file('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Attendance Check" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    zip.file('xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="7"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFC62828"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFA9D18E"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFB4C7E7"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    zip.file('xl/worksheets/sheet1.xml', worksheetXml(rows));
    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function absenteeWorksheetXml(reportData) {
    const absentees = reportData.absentees || [];
    const sheetRows = [
      '<row r="1" ht="26" customHeight="1">' +
        cell('A1', 'JOINT DELIVERY VOUCHER PROGRAM (JDVP-TVL)', 1) +
      '</row>',
      '<row r="2" ht="20" customHeight="1">' +
        cell('A2', 'STUDENT ATTENDANCE & ABSENTEEISM AUDIT REPORT', 2) +
      '</row>',
      '<row r="3" ht="22" customHeight="1">' +
        cell('A3', 'Scope / Qualification:', 3) +
        cell('B3', reportData.qualification || 'All Qualifications', 4) +
        cell('D3', 'Evaluation Scope:', 3) +
        cell('E3', reportData.dateDisplay || 'All Time', 4) +
        cell('G3', 'Search Filter:', 3) +
        cell('H3', reportData.searchTerm || 'None', 4) +
      '</row>',
      '<row r="4" ht="22" customHeight="1">' +
        cell('A4', 'Total Enrolled Cohort:', 3) +
        cell('B4', (reportData.totalEnrolled || 0) + ' Students', 4) +
        cell('D4', 'Total Recorded Sessions:', 3) +
        cell('E4', (reportData.totalSessions || 0) + ' Sessions', 4) +
        cell('G4', 'Students with Absences:', 3) +
        cell('H4', (reportData.totalAbsentees || 0) + ' Students', 4) +
        cell('I4', 'Total Absent Days:', 3) +
        cell('J4', (reportData.totalAbsentDays || 0) + ' Days', 4) +
      '</row>',
      '<row r="5" ht="20" customHeight="1">' +
        cell('A5', 'Generated On:', 3) +
        cell('B5', reportData.generatedAt || '', 4) +
        cell('D5', 'Overall Absentee Rate:', 3) +
        cell('E5', (reportData.totalEnrolled > 0 ? Math.round((reportData.totalAbsentees / reportData.totalEnrolled) * 100) : 0) + '% of Cohort', 4) +
        cell('G5', 'Audit Classification:', 3) +
        cell('H5', 'Official JDVP School Record', 4) +
      '</row>',
      '<row r="6" ht="10" customHeight="1"></row>',
      '<row r="7" ht="26" customHeight="1">' +
        cell('A7', 'Rank', 5) +
        cell('B7', 'Trainee ID', 5) +
        cell('C7', 'QR Code #', 5) +
        cell('D7', 'Student Name', 5) +
        cell('E7', 'Qualification', 5) +
        cell('F7', 'Total Sessions', 5) +
        cell('G7', 'Days Present', 5) +
        cell('H7', 'Days Absent', 5) +
        cell('I7', 'Attendance Rate', 5) +
        cell('J7', 'Absentee Risk & Remarks', 5) +
      '</row>'
    ];

    if (absentees.length === 0) {
      sheetRows.push(
        '<row r="8" ht="24" customHeight="1">' +
          cell('A8', 'No absent students found matching the selected criteria. All students have 100% attendance.', 6) +
        '</row>'
      );
    } else {
      absentees.forEach(function (s, index) {
        const rowNum = 8 + index;
        const absentStyle = (s.daysAbsent >= 5 || s.rate < 50) ? 9 : ((s.daysAbsent >= 3 || s.rate < 75) ? 10 : 8);
        const rateStyle = s.rate >= 90 ? 11 : (s.rate >= 75 ? 7 : (s.rate >= 50 ? 10 : 9));
        const remarksStyle = (s.daysAbsent >= 5 || s.rate < 50) ? 9 : ((s.daysAbsent >= 3 || s.rate < 75) ? 10 : 6);

        sheetRows.push(
          '<row r="' + rowNum + '">' +
            cell('A' + rowNum, '#' + (index + 1), 8) +
            cell('B' + rowNum, s.id || '', 7) +
            cell('C' + rowNum, s.qrCode || '', 7) +
            cell('D' + rowNum, s.name || '', 6) +
            cell('E' + rowNum, s.qualification || '', 7) +
            cell('F' + rowNum, String(s.totalSessions || 0), 7) +
            cell('G' + rowNum, String(s.daysPresent || 0), 7) +
            cell('H' + rowNum, (s.daysAbsent || 0) + (s.daysAbsent === 1 ? ' day' : ' days'), absentStyle) +
            cell('I' + rowNum, (s.rate || 0) + '%', rateStyle) +
            cell('J' + rowNum, s.remarks || '', remarksStyle) +
          '</row>'
        );
      });
    }

    const lastRow = Math.max(8, absentees.length + 7);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:J' + lastRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<cols>' +
      '<col min="1" max="1" width="10" customWidth="1"/>' +
      '<col min="2" max="2" width="16" customWidth="1"/>' +
      '<col min="3" max="3" width="14" customWidth="1"/>' +
      '<col min="4" max="4" width="38" customWidth="1"/>' +
      '<col min="5" max="5" width="22" customWidth="1"/>' +
      '<col min="6" max="6" width="16" customWidth="1"/>' +
      '<col min="7" max="7" width="15" customWidth="1"/>' +
      '<col min="8" max="8" width="15" customWidth="1"/>' +
      '<col min="9" max="9" width="18" customWidth="1"/>' +
      '<col min="10" max="10" width="34" customWidth="1"/>' +
      '</cols>' +
      '<sheetData>' + sheetRows.join('') + '</sheetData>' +
      '<autoFilter ref="A7:J' + lastRow + '"/>' +
      '</worksheet>';
  }

  function qualificationSummaryWorksheetXml(reportData) {
    const summaries = reportData.qualificationSummaries || [];
    const sheetRows = [
      '<row r="1" ht="26" customHeight="1">' +
        cell('A1', 'JOINT DELIVERY VOUCHER PROGRAM (JDVP-TVL)', 1) +
      '</row>',
      '<row r="2" ht="20" customHeight="1">' +
        cell('A2', 'QUALIFICATION ATTENDANCE & ABSENTEE EVALUATION SUMMARY', 2) +
      '</row>',
      '<row r="3" ht="20" customHeight="1">' +
        cell('A3', 'Generated On:', 3) +
        cell('B3', reportData.generatedAt || '', 4) +
        cell('D3', 'Evaluation Scope:', 3) +
        cell('E3', reportData.dateDisplay || 'All Time', 4) +
      '</row>',
      '<row r="4" ht="10" customHeight="1"></row>',
      '<row r="5" ht="25" customHeight="1">' +
        cell('A5', 'Qualification', 5) +
        cell('B5', 'Total Enrolled', 5) +
        cell('C5', 'Students with Absences', 5) +
        cell('D5', 'Perfect Attendance', 5) +
        cell('E5', 'Total Absent Days', 5) +
        cell('F5', 'Cohort Attendance Rate', 5) +
      '</row>'
    ];

    let totalEnrolledAll = 0;
    let totalAbsenteesAll = 0;
    let totalPerfectAll = 0;
    let totalAbsentDaysAll = 0;

    summaries.forEach(function (q, index) {
      const rowNum = 6 + index;
      totalEnrolledAll += (q.enrolled || 0);
      totalAbsenteesAll += (q.withAbsences || 0);
      totalPerfectAll += (q.perfectAttendance || 0);
      totalAbsentDaysAll += (q.totalAbsentDays || 0);

      sheetRows.push(
        '<row r="' + rowNum + '">' +
          cell('A' + rowNum, q.qualification || '', 6) +
          cell('B' + rowNum, String(q.enrolled || 0), 7) +
          cell('C' + rowNum, String(q.withAbsences || 0), 7) +
          cell('D' + rowNum, String(q.perfectAttendance || 0), 7) +
          cell('E' + rowNum, String(q.totalAbsentDays || 0), 7) +
          cell('F' + rowNum, (q.attendanceRate || 0) + '%', 8) +
        '</row>'
      );
    });

    const summaryRowIndex = 6 + summaries.length;
    const overallRate = totalEnrolledAll > 0 && reportData.totalSessions > 0
      ? Math.round(Math.max(0, 100 - (totalAbsentDaysAll / (totalEnrolledAll * reportData.totalSessions)) * 100))
      : 100;

    sheetRows.push(
      '<row r="' + summaryRowIndex + '" ht="22" customHeight="1">' +
        cell('A' + summaryRowIndex, 'OVERALL TOTAL / COHORT', 12) +
        cell('B' + summaryRowIndex, String(totalEnrolledAll), 13) +
        cell('C' + summaryRowIndex, String(totalAbsenteesAll), 13) +
        cell('D' + summaryRowIndex, String(totalPerfectAll), 13) +
        cell('E' + summaryRowIndex, String(totalAbsentDaysAll), 13) +
        cell('F' + summaryRowIndex, overallRate + '%', 13) +
      '</row>'
    );

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:F' + summaryRowIndex + '"/>' +
      '<cols>' +
      '<col min="1" max="1" width="26" customWidth="1"/>' +
      '<col min="2" max="2" width="18" customWidth="1"/>' +
      '<col min="3" max="3" width="24" customWidth="1"/>' +
      '<col min="4" max="4" width="22" customWidth="1"/>' +
      '<col min="5" max="5" width="20" customWidth="1"/>' +
      '<col min="6" max="6" width="26" customWidth="1"/>' +
      '</cols>' +
      '<sheetData>' + sheetRows.join('') + '</sheetData>' +
      '</worksheet>';
  }

  function absenteeStylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="8">' +
      '<font><sz val="11"/><name val="Calibri"/><color rgb="FF000000"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>' +
      '<font><b/><sz val="15"/><name val="Calibri"/><color rgb="FF1F4E78"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF000000"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF991B1B"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF166534"/></font>' +
      '<font><i/><sz val="9.5"/><name val="Calibri"/><color rgb="FF595959"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF854D0E"/></font>' +
      '</fonts>' +
      '<fills count="8">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F8"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="3">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>' +
      '<border><left/><right/><top style="thin"><color rgb="FF1F4E78"/></top><bottom style="double"><color rgb="FF1F4E78"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="14">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="7" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  async function createAbsenteeReportWorkbook(reportData, zipLibrary) {
    const zip = new zipLibrary();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
    zip.file('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      '<sheet name="Absentee Details" sheetId="1" r:id="rId1"/>' +
      '<sheet name="Qualification Breakdown" sheetId="2" r:id="rId2"/>' +
      '</sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    zip.file('xl/styles.xml', absenteeStylesXml());
    zip.file('xl/worksheets/sheet1.xml', absenteeWorksheetXml(reportData));
    zip.file('xl/worksheets/sheet2.xml', qualificationSummaryWorksheetXml(reportData));

    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  const api = {
    buildAttendanceRows: buildAttendanceRows,
    createWorkbook: createWorkbook,
    createAbsenteeReportWorkbook: createAbsenteeReportWorkbook
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AttendanceExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
