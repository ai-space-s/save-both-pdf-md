/**
 * SaveBoth - settingsUtils
 * 저장 위치 설정(chrome.storage.local, 로컬에만 저장, 서버 전송 없음)을 관리한다.
 *
 * 실제 폴더 핸들(FileSystemDirectoryHandle)은 fsHandleStore.js가 IndexedDB에 보관한다.
 * 여기서는 팝업/서비스워커가 빠르게 참조할 "의도"만 저장한다.
 *   - folderName: 사용자가 선택한 폴더의 표시 이름 (빈 문자열이면 기본 Downloads 폴더)
 *   - askEachTime: 저장할 때마다 OS 네이티브 "다른 이름으로 저장" 창을 띄울지 여부
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothSettings = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'saveBothSettings';

  const DEFAULT_SETTINGS = {
    folderName: '',
    askEachTime: false
  };

  function getSettings() {
    return new Promise(function (resolve) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve(Object.assign({}, DEFAULT_SETTINGS));
        return;
      }
      chrome.storage.local.get(STORAGE_KEY, function (data) {
        const stored = (data && data[STORAGE_KEY]) || {};
        resolve({
          folderName: typeof stored.folderName === 'string' ? stored.folderName : DEFAULT_SETTINGS.folderName,
          askEachTime: !!stored.askEachTime
        });
      });
    });
  }

  function saveSettings(partial) {
    return getSettings().then(function (current) {
      const next = Object.assign({}, current, partial || {});
      next.folderName = String(next.folderName || '');
      next.askEachTime = !!next.askEachTime;
      return new Promise(function (resolve) {
        const payload = {};
        payload[STORAGE_KEY] = next;
        chrome.storage.local.set(payload, function () {
          resolve(next);
        });
      });
    });
  }

  return {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getSettings: getSettings,
    saveSettings: saveSettings
  };
});
