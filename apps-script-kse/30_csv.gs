/**
 * 아마존 리포트 CSV 파싱.
 *
 * 아마존은 리포트를 콤마 CSV 로도, 탭 구분(TSV)으로도 준다.
 * 인코딩은 UTF-8(BOM 있는 경우 많음)이지만 Shift-JIS 로 받아지는 경우도 있어 둘 다 대응한다.
 */

/**
 * 바이트 → 문자열.
 * UTF-8 로 먼저 읽어 보고 깨진 문자(U+FFFD)가 나오면 Shift-JIS 로 다시 읽는다.
 * (일본어 Shift-JIS 바이트열은 대개 유효한 UTF-8이 아니므로 이 판별이 잘 맞는다)
 */
function decodeBytes_(bytes) {
  var utf8;
  try {
    utf8 = Utilities.newBlob(bytes).getDataAsString('UTF-8');
  } catch (e) {
    utf8 = null;
  }
  if (utf8 && utf8.indexOf('�') < 0) return utf8.replace(/^﻿/, '');
  return Utilities.newBlob(bytes).getDataAsString('Shift_JIS').replace(/^﻿/, '');
}

/** 첫 줄에서 탭과 콤마 개수를 보고 구분자를 정한다. */
function detectDelimiter_(text) {
  var first = String(text).split(/\r\n|\r|\n/)[0] || '';
  var tabs = (first.match(/\t/g) || []).length;
  var commas = (first.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

/** RFC4180 파서. 따옴표 안의 구분자·줄바꿈을 그대로 살린다. */
function parseDelimited_(text, delim) {
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;

  text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter(function (r) {
    return r.some(function (c) { return String(c).trim() !== ''; });
  });
}

/** 바이트 → {header:[], rows:[[]], index:{name:idx}} */
function readReport_(bytes) {
  var text = decodeBytes_(bytes);
  var rows = parseDelimited_(text, detectDelimiter_(text));
  if (!rows.length) return { header: [], rows: [], index: {} };

  var header = rows[0].map(function (h) {
    return String(h).trim().replace(/^﻿/, '');
  });
  var index = {};
  for (var i = 0; i < header.length; i++) {
    if (index[header[i]] === undefined) index[header[i]] = i;
  }
  return { header: header, rows: rows.slice(1), index: index };
}

/** 여러 후보 이름 중 먼저 있는 컬럼의 인덱스. 없으면 -1 */
function findCol_(index) {
  for (var i = 1; i < arguments.length; i++) {
    var idx = index[arguments[i]];
    if (idx !== undefined) return idx;
  }
  return -1;
}

function cellAt_(row, idx) {
  if (idx < 0 || idx >= row.length) return '';
  // 구글시트에 텍스트로 넣은 큰 숫자는 앞에 ' 가 붙어 보일 수 있어 비교 전에 떼어낸다
  return String(row[idx] === null || row[idx] === undefined ? '' : row[idx]).trim().replace(/^'/, '');
}
