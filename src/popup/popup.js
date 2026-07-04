/**
 * SaveBoth - popup
 * 현재 탭 정보 표시, 저장 요청 전송, 진행/결과 상태 표시.
 */
/* global SaveBothErrors, SaveBothSettings, SaveBothFsHandle */
(function () {
  'use strict';

  const els = {
    title: document.getElementById('pageTitle'),
    url: document.getElementById('pageUrl'),
    status: document.getElementById('status'),
    buttons: {
      both: document.getElementById('saveBothBtn'),
      pdf: document.getElementById('savePdfBtn'),
      md: document.getElementById('saveMdBtn')
    },
    folderDisplay: document.getElementById('folderDisplay'),
    chooseFolderBtn: document.getElementById('chooseFolderBtn'),
    resetFolderBtn: document.getElementById('resetFolderBtn'),
    folderPermissionNote: document.getElementById('folderPermissionNote'),
    reconnectFolderBtn: document.getElementById('reconnectFolderBtn'),
    askEachTimeCheckbox: document.getElementById('askEachTimeCheckbox'),
    settingsHint: document.getElementById('settingsHint')
  };

  let currentTab = null;
  let supported = false;

  function setButtonsEnabled(enabled) {
    Object.keys(els.buttons).forEach(function (key) {
      els.buttons[key].disabled = !enabled;
    });
  }

  function showStatus(kind, text) {
    els.status.hidden = false;
    els.status.className = 'status ' + kind;
    els.status.textContent = text;
  }

  function hideStatus() {
    els.status.hidden = true;
    els.status.textContent = '';
  }

  function shortenUrl(url, maxLength) {
    const limit = maxLength || 64;
    const value = String(url || '');
    if (value.length <= limit) {
      return value;
    }
    return value.slice(0, limit - 1) + '…';
  }

  function renderResult(result) {
    setButtonsEnabled(supported);
    if (!result) {
      hideStatus();
      return;
    }
    if (result.unsupported) {
      showStatus('error', SaveBothErrors.UNSUPPORTED_MESSAGE);
      return;
    }
    const agg = SaveBothErrors.aggregateSaveStatus(result);
    let text = agg.headline;
    if (agg.lines.length) {
      text += '\n\n' + agg.lines.join('\n');
    }
    if (agg.detail) {
      text += '\n\n' + agg.detail;
    }
    if (result.truncated && agg.status !== 'failed') {
      text += '\n\nNote: the page exceeded the capture limit, so the PDF was truncated.';
    }
    if (result.pdfFolderFallback || result.mdFolderFallback) {
      text +=
        '\n\nNote: the selected folder was not accessible, so files were saved to Downloads instead. ' +
        'Open "Save location settings" to reconnect.';
    }
    const kindMap = { success: 'success', partial: 'partial', failed: 'error' };
    showStatus(kindMap[agg.status] || 'error', text);
  }

  async function startSave(mode) {
    if (!currentTab || !supported) {
      return;
    }
    setButtonsEnabled(false);
    showStatus('progress', 'Preparing page...');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'SB_START_SAVE',
        mode: mode,
        tabId: currentTab.id
      });
      if (!res || res.ok !== true) {
        if (res && res.busy) {
          showStatus('progress', 'A save is already in progress...');
        } else {
          showStatus('error', 'Save failed.\n\nPlease try again on a supported webpage.');
          setButtonsEnabled(supported);
        }
      }
    } catch (e) {
      showStatus('error', 'Save failed.\n\nPlease try again on a supported webpage.');
      setButtonsEnabled(supported);
    }
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) {
      return;
    }
    if (msg.type === 'SB_PROGRESS') {
      setButtonsEnabled(false);
      showStatus('progress', msg.stage);
    } else if (msg.type === 'SB_DONE') {
      renderResult(msg.result);
    }
  });

  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // 같은 이름의 파일이 이미 있으면 "_2", "_3"... 을 붙여 덮어쓰지 않는다.
  async function getUniqueFileHandle(dirHandle, filename) {
    const dot = filename.lastIndexOf('.');
    const stem = dot >= 0 ? filename.slice(0, dot) : filename;
    const ext = dot >= 0 ? filename.slice(dot) : '';
    let candidate = filename;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await dirHandle.getFileHandle(candidate, { create: false });
      } catch (e) {
        return dirHandle.getFileHandle(candidate, { create: true });
      }
      n += 1;
      candidate = stem + '_' + n + ext;
    }
  }

  // 서비스 워커가 File System Access API를 직접 쓸 수 없어(Window 전용) 위임하는 요청 처리
  async function handleFsWrite(msg) {
    try {
      const handle = await SaveBothFsHandle.getHandle();
      if (!handle) {
        return { ok: false, reason: 'no-handle' };
      }
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        return { ok: false, reason: 'no-permission' };
      }
      const fileHandle = await getUniqueFileHandle(handle, msg.filename);
      const writable = await fileHandle.createWritable();
      await writable.write(base64ToUint8Array(msg.bytesBase64));
      await writable.close();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'SB_FS_WRITE') {
      handleFsWrite(msg).then(sendResponse);
      return true; // 비동기 응답을 위해 채널을 열어둔다
    }
    return false;
  });

  async function restoreStateFromStorage() {
    try {
      const data = await chrome.storage.session.get('saveState');
      const state = data && data.saveState;
      if (!state) {
        return;
      }
      const age = Date.now() - (state.updatedAt || 0);
      if (state.state === 'saving' && age < 90000) {
        setButtonsEnabled(false);
        showStatus('progress', state.stage || 'Saving...');
      } else if (state.state === 'done' && age < 15000) {
        renderResult(state.result);
      }
    } catch (e) { /* 상태 복원 실패는 무시 */ }
  }

  const DEFAULT_FOLDER_LABEL = 'Default (Downloads folder)';

  // 저장된 핸들과 설정을 다시 읽어 폴더 표시/버튼/경고를 최신 상태로 그린다.
  async function refreshFolderUi() {
    const settings = await SaveBothSettings.getSettings();
    els.askEachTimeCheckbox.checked = settings.askEachTime;

    let handle = null;
    try {
      handle = await SaveBothFsHandle.getHandle();
    } catch (e) {
      handle = null;
    }

    const hasFolder = !!(handle && settings.folderName);
    els.folderDisplay.textContent = hasFolder ? settings.folderName : DEFAULT_FOLDER_LABEL;
    els.resetFolderBtn.hidden = !hasFolder;
    els.chooseFolderBtn.textContent = hasFolder ? 'Change folder…' : 'Choose folder…';

    let needsReconnect = false;
    if (hasFolder) {
      try {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        needsReconnect = permission !== 'granted';
      } catch (e) {
        needsReconnect = true;
      }
    }
    els.folderPermissionNote.hidden = !needsReconnect;

    if (settings.askEachTime) {
      els.settingsHint.textContent =
        'A "Save As" dialog will appear for each file so you can pick any folder.';
    } else if (hasFolder) {
      els.settingsHint.textContent = 'Files are saved directly to the selected folder.';
    } else {
      els.settingsHint.textContent = 'Files are saved to your Downloads folder.';
    }
  }

  async function initSettings() {
    await refreshFolderUi();

    els.chooseFolderBtn.addEventListener('click', async function () {
      if (typeof window.showDirectoryPicker !== 'function') {
        els.settingsHint.textContent = 'Choosing a folder is not supported in this browser.';
        return;
      }
      try {
        // mode를 지정하지 않으면 읽기 권한만 부여되어, 저장 시점에 쓰기 권한 확인이
        // 항상 실패한다. 처음부터 readwrite 권한을 요청해야 한다.
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await SaveBothFsHandle.saveHandle(handle);
        await SaveBothSettings.saveSettings({ folderName: handle.name, askEachTime: false });
        await refreshFolderUi();
      } catch (e) {
        // 사용자가 선택창을 취소한 경우 등은 조용히 무시
      }
    });

    els.resetFolderBtn.addEventListener('click', async function () {
      try {
        await SaveBothFsHandle.clearHandle();
      } catch (e) { /* ignore */ }
      await SaveBothSettings.saveSettings({ folderName: '' });
      await refreshFolderUi();
    });

    els.reconnectFolderBtn.addEventListener('click', async function () {
      try {
        const handle = await SaveBothFsHandle.getHandle();
        if (handle) {
          await handle.requestPermission({ mode: 'readwrite' });
        }
      } catch (e) { /* ignore */ }
      await refreshFolderUi();
    });

    els.askEachTimeCheckbox.addEventListener('change', async function () {
      await SaveBothSettings.saveSettings({ askEachTime: els.askEachTimeCheckbox.checked });
      await refreshFolderUi();
    });
  }

  async function init() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs && tabs[0];

    els.title.textContent = (currentTab && currentTab.title) || 'Unknown page';
    els.url.textContent = shortenUrl(currentTab && currentTab.url);

    if (!currentTab || SaveBothErrors.isUnsupportedUrl(currentTab.url)) {
      supported = false;
      setButtonsEnabled(false);
      showStatus('error', SaveBothErrors.UNSUPPORTED_MESSAGE);
      return;
    }
    supported = true;
    setButtonsEnabled(true);
    await restoreStateFromStorage();
  }

  els.buttons.both.addEventListener('click', function () { startSave('both'); });
  els.buttons.pdf.addEventListener('click', function () { startSave('pdf'); });
  els.buttons.md.addEventListener('click', function () { startSave('md'); });

  init();
  initSettings();
})();
