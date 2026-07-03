/**
 * SaveBoth - errorUtils
 * 지원되지 않는 URL 판별과 저장 결과 상태 집계.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothErrors = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const UNSUPPORTED_MESSAGE =
    'This page cannot be saved by the extension.\nPlease try a normal webpage.';

  /**
   * http/https 페이지만 지원한다.
   * chrome://, chrome-extension://, edge://, about:, file:// 등은 모두 미지원.
   */
  function isUnsupportedUrl(url) {
    if (!url) {
      return true;
    }
    const value = String(url).trim().toLowerCase();
    return !(value.startsWith('http://') || value.startsWith('https://'));
  }

  /**
   * 저장 결과 집계.
   * result: { pdf: true|false|null, md: true|false|null }
   *   - null/undefined 는 시도하지 않음(예: PDF Only 모드의 md)
   * 반환: { status, headline, lines, detail }
   */
  function aggregateSaveStatus(result) {
    const res = result || {};
    const labels = { pdf: 'PDF', md: 'Markdown' };
    const attempted = ['pdf', 'md'].filter(function (k) {
      return res[k] === true || res[k] === false;
    });
    const succeeded = attempted.filter(function (k) {
      return res[k] === true;
    });

    if (attempted.length === 0 || succeeded.length === 0) {
      return {
        status: 'failed',
        headline: 'Save failed.',
        lines: [],
        detail: 'Please try again on a supported webpage.'
      };
    }

    const lines = attempted.map(function (k) {
      return labels[k] + ': ' + (res[k] ? 'saved' : 'failed');
    });

    if (succeeded.length === attempted.length) {
      return { status: 'success', headline: 'Saved successfully.', lines: lines, detail: '' };
    }
    return { status: 'partial', headline: 'Partially saved.', lines: lines, detail: '' };
  }

  return {
    isUnsupportedUrl: isUnsupportedUrl,
    aggregateSaveStatus: aggregateSaveStatus,
    UNSUPPORTED_MESSAGE: UNSUPPORTED_MESSAGE
  };
});
