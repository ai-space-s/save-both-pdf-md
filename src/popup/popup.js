/**
 * SaveBoth - popup
 * 현재 탭 정보 표시, 저장 요청 전송, 진행/결과 상태 표시.
 */
/* global SaveBothErrors */
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
    }
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
})();
