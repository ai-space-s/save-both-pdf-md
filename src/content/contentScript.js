/**
 * SaveBoth - content script
 * 사용자가 확장 버튼을 눌렀을 때만 주입된다.
 * 페이지 정보 조회, 스크롤 제어, Markdown 추출 요청을 처리한다.
 * 페이지 콘텐츠를 외부로 전송하지 않는다.
 */
(function () {
  'use strict';

  if (window.__saveBothContentReady) {
    return;
  }
  window.__saveBothContentReady = true;

  // CSS scroll-behavior: smooth 페이지에서도 즉시 이동시켜
  // 스크롤 애니메이션 도중 캡처되는 것을 방지한다.
  function scrollToInstant(y) {
    try {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    } catch (e) {
      window.scrollTo(0, y);
    }
  }

  function elementScrollToInstant(el, y) {
    try {
      el.scrollTo({ top: y, left: 0, behavior: 'instant' });
    } catch (e) {
      el.scrollTop = y;
    }
  }

  // ChatGPT 같은 SPA는 window가 아니라 내부 컨테이너가 스크롤된다.
  // 캡처 대상 스크롤 컨테이너 (null이면 window 스크롤 모드)
  let captureContainer = null;
  const CONTAINER_SCAN_LIMIT = 15000;

  /**
   * 페이지의 실질적인 스크롤 컨테이너를 찾는다.
   * window 스크롤이 충분히 길면 window 모드(null 반환),
   * 아니면 화면의 상당 부분을 차지하는 가장 긴 내부 스크롤 요소를 찾는다.
   */
  function findScrollContainer() {
    const docEl = document.scrollingElement || document.documentElement;
    const windowScrollable = docEl && docEl.scrollHeight > window.innerHeight * 1.3;

    let best = null;
    const all = document.body ? document.body.querySelectorAll('*') : [];
    const count = Math.min(all.length, CONTAINER_SCAN_LIMIT);
    for (let i = 0; i < count; i++) {
      const el = all[i];
      // 저렴한 검사 먼저: 스크롤 여유가 크고, 화면의 주요 영역을 차지해야 함
      if (el.scrollHeight - el.clientHeight < 200) {
        continue;
      }
      if (el.clientHeight < window.innerHeight * 0.4) {
        continue;
      }
      if (el.clientWidth < window.innerWidth * 0.3) {
        continue;
      }
      let overflowY = '';
      try {
        overflowY = getComputedStyle(el).overflowY;
      } catch (e) {
        continue;
      }
      if (overflowY !== 'auto' && overflowY !== 'scroll') {
        continue;
      }
      if (!best || el.scrollHeight > best.scrollHeight) {
        best = el;
      }
    }

    // window 스크롤이 더 길면 window 모드 우선
    if (windowScrollable && (!best || docEl.scrollHeight >= best.scrollHeight)) {
      return null;
    }
    return best;
  }

  function getPageInfo() {
    const docEl = document.documentElement;
    const body = document.body;

    captureContainer = findScrollContainer();

    if (captureContainer) {
      // 내부 컨테이너 모드: 컨테이너의 화면상 보이는 영역만 캡처 대상으로 삼는다
      const rect = captureContainer.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(window.innerWidth, rect.right);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      const visibleWidth = Math.max(0, right - left);
      const visibleHeight = Math.max(0, bottom - top);
      return {
        ok: true,
        title: document.title || '',
        url: location.href,
        scrollMode: 'element',
        pageHeight: captureContainer.scrollHeight,
        viewportHeight: Math.round(visibleHeight),
        viewportWidth: Math.round(visibleWidth),
        scrollY: Math.round(captureContainer.scrollTop || 0),
        containerRect: {
          x: Math.round(left),
          y: Math.round(top),
          width: Math.round(visibleWidth),
          height: Math.round(visibleHeight)
        },
        devicePixelRatio: window.devicePixelRatio || 1
      };
    }

    const pageHeight = Math.max(
      docEl ? docEl.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      docEl ? docEl.offsetHeight : 0
    );
    return {
      ok: true,
      title: document.title || '',
      url: location.href,
      scrollMode: 'window',
      pageHeight: pageHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      scrollY: Math.round(window.scrollY || 0),
      containerRect: null,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  // 캡처 중 숨긴 fixed/sticky 요소들 (원래 인라인 스타일 복원용)
  let hiddenStickyElements = [];
  const STICKY_SCAN_LIMIT = 20000;

  /**
   * 두 번째 세그먼트부터 sticky header가 콘텐츠를 가리는 것을 막기 위해
   * position: fixed/sticky 요소를 visibility:hidden 으로 숨긴다.
   * (visibility는 레이아웃을 유지하므로 페이지 높이가 변하지 않는다)
   */
  function hideStickyElements() {
    hiddenStickyElements = [];
    if (!document.body) {
      return 0;
    }
    const all = document.body.querySelectorAll('*');
    const count = Math.min(all.length, STICKY_SCAN_LIMIT);
    for (let i = 0; i < count; i++) {
      const el = all[i];
      let pos = '';
      try {
        pos = getComputedStyle(el).position;
      } catch (e) {
        continue;
      }
      if (pos === 'fixed' || pos === 'sticky') {
        // 캡처 대상 컨테이너 자신이나 그 조상을 숨기면 캡처 내용이 사라지므로 제외
        if (captureContainer && el.contains(captureContainer)) {
          continue;
        }
        hiddenStickyElements.push({
          el: el,
          value: el.style.getPropertyValue('visibility'),
          priority: el.style.getPropertyPriority('visibility')
        });
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
    return hiddenStickyElements.length;
  }

  function showStickyElements() {
    for (const item of hiddenStickyElements) {
      try {
        if (item.value) {
          item.el.style.setProperty('visibility', item.value, item.priority);
        } else {
          item.el.style.removeProperty('visibility');
        }
      } catch (e) { /* 요소가 사라졌으면 무시 */ }
    }
    hiddenStickyElements = [];
  }

  function extractMarkdown() {
    const meta = self.SaveBothMetadata.extractMetadata(document, location.href, new Date());
    const mainEl = self.SaveBothMarkdown.extractMainContent(document);
    const body = self.SaveBothMarkdown.htmlToMarkdown(mainEl, { baseUrl: location.href });
    if (!body || !body.trim()) {
      throw new Error('No content extracted');
    }
    const markdown = self.SaveBothMetadata.buildMarkdownDocument(meta, body);
    return { ok: true, markdown: markdown, title: meta.title };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    try {
      switch (msg && msg.type) {
        case 'SB_PING':
          sendResponse({ ok: true });
          break;
        case 'SB_GET_PAGE_INFO':
          sendResponse(getPageInfo());
          break;
        case 'SB_SCROLL_TO':
          // 가상화된 페이지(ChatGPT 등)는 스크롤 중 높이가 변하므로
          // 매 스크롤마다 현재 높이를 함께 반환한다.
          if (captureContainer) {
            elementScrollToInstant(captureContainer, Number(msg.y) || 0);
            sendResponse({
              ok: true,
              scrollY: Math.round(captureContainer.scrollTop || 0),
              pageHeight: captureContainer.scrollHeight
            });
          } else {
            scrollToInstant(Number(msg.y) || 0);
            const docEl = document.scrollingElement || document.documentElement;
            sendResponse({
              ok: true,
              scrollY: Math.round(window.scrollY || 0),
              pageHeight: docEl ? docEl.scrollHeight : 0
            });
          }
          break;
        case 'SB_RESTORE_SCROLL':
          if (captureContainer) {
            elementScrollToInstant(captureContainer, Number(msg.y) || 0);
          } else {
            scrollToInstant(Number(msg.y) || 0);
          }
          sendResponse({ ok: true });
          break;
        case 'SB_HIDE_STICKY':
          sendResponse({ ok: true, hidden: hideStickyElements() });
          break;
        case 'SB_SHOW_STICKY':
          showStickyElements();
          sendResponse({ ok: true });
          break;
        case 'SB_EXTRACT_MARKDOWN':
          sendResponse(extractMarkdown());
          break;
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
    return false;
  });
})();
