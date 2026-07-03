/**
 * SaveBoth - filenameUtils
 * 안전한 파일명 생성 유틸리티.
 * 브라우저(content/popup/service worker)와 Node 테스트 양쪽에서 로드 가능.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothFilename = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // PRD 13.3: \ / : * ? " < > | # % & { } $ ! ' @ + ` =
  const UNSAFE_CHARS = /[\\/:*?"<>|#%&{}$!'@+`=]/g;
  const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
  const DEFAULT_MAX_LENGTH = 80;
  const FALLBACK_NAME = 'saved-page';

  function sanitizeFilename(title, maxLength) {
    const limit = typeof maxLength === 'number' && maxLength > 0 ? maxLength : DEFAULT_MAX_LENGTH;
    let name = String(title == null ? '' : title);
    name = name.replace(CONTROL_CHARS, '_');
    name = name.replace(UNSAFE_CHARS, '_');
    name = name.replace(/\s+/g, '_');
    name = name.replace(/_+/g, '_');
    name = name.replace(/^_+|_+$/g, '');
    if (name.length > limit) {
      name = name.slice(0, limit).replace(/_+$/g, '');
    }
    // Windows에서 문제되는, 마침표로 끝나는 이름 방지
    name = name.replace(/\.+$/g, '');
    if (!name) {
      return FALLBACK_NAME;
    }
    return name;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // "YYYY-MM-DD_HH-mm" (로컬 시간)
  function generateTimestamp(date) {
    const d = date instanceof Date ? date : new Date();
    return (
      d.getFullYear() +
      '-' +
      pad2(d.getMonth() + 1) +
      '-' +
      pad2(d.getDate()) +
      '_' +
      pad2(d.getHours()) +
      '-' +
      pad2(d.getMinutes())
    );
  }

  // "{sanitized-title}_{YYYY-MM-DD_HH-mm}"
  function generateBaseFilename(title, date) {
    return sanitizeFilename(title) + '_' + generateTimestamp(date);
  }

  return {
    sanitizeFilename: sanitizeFilename,
    generateTimestamp: generateTimestamp,
    generateBaseFilename: generateBaseFilename,
    FALLBACK_NAME: FALLBACK_NAME,
    DEFAULT_MAX_LENGTH: DEFAULT_MAX_LENGTH
  };
});
