/**
 * SaveBoth - downloadUtils
 * 생성된 파일을 chrome.downloads API로 로컬 다운로드한다.
 * 서버 업로드는 절대 하지 않는다. (data: URL 만 사용)
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothDownload = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function uint8ToBase64(bytes) {
    let binary = '';
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  function buildDataUrl(mime, bytes) {
    return 'data:' + mime + ';base64,' + uint8ToBase64(bytes);
  }

  function downloadDataUrl(url, filename) {
    return new Promise(function (resolve, reject) {
      chrome.downloads.download(
        { url: url, filename: filename, saveAs: false, conflictAction: 'uniquify' },
        function (downloadId) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (downloadId === undefined) {
            reject(new Error('Download did not start'));
          } else {
            resolve(downloadId);
          }
        }
      );
    });
  }

  function downloadBytes(bytes, mime, filename) {
    return downloadDataUrl(buildDataUrl(mime, bytes), filename);
  }

  function downloadText(text, mime, filename) {
    const bytes = new TextEncoder().encode(String(text));
    return downloadBytes(bytes, mime + ';charset=utf-8', filename);
  }

  return {
    uint8ToBase64: uint8ToBase64,
    buildDataUrl: buildDataUrl,
    downloadDataUrl: downloadDataUrl,
    downloadBytes: downloadBytes,
    downloadText: downloadText
  };
});
