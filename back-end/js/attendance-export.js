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

  const api = {
    buildAttendanceRows: buildAttendanceRows,
    createWorkbook: createWorkbook
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AttendanceExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
