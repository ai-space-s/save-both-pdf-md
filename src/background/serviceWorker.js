/**
 * SaveBoth - background service worker (Manifest V3)
 * 팝업의 저장 요청을 받아 PDF 캡처와 Markdown 추출을 조율한다.
 * 모든 처리는 로컬에서 수행되며 외부 네트워크 요청이 없다.
 */
/* global SaveBothErrors, SaveBothFilename, SaveBothCapture, SaveBothPdf, SaveBothDownload */

importScripts(
  '../lib/errorUtils.js',
  '../lib/filenameUtils.js',
  '../lib/metadataUtils.js',
  '../lib/captureUtils.js',
  '../lib/pdfGenerator.js',
  '../lib/downloadUtils.js'
);

const LIMITS = SaveBothCapture.DEFAULT_LIMITS;
// captureVisibleTab 은 초당 최대 2회 호출 제한이 있어 캡처 간 최소 간격을 둔다.
const MIN_CAPTURE_INTERVAL_MS = 550;
const JPEG_QUALITY = 85;
// PDF 페이지 폭 상한 (넘으면 축소 저장하여 파일 크기를 줄인다)
const MAX_PAGE_WIDTH_PX = 1600;

const CONTENT_SCRIPT_FILES = [
  'src/lib/metadataUtils.js',
  'src/lib/markdownExtractor.js',
  'src/content/contentScript.js'
];

let saving = false;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'SB_START_SAVE') {
    if (saving) {
      sendResponse({ ok: false, busy: true });
      return false;
    }
    sendResponse({ ok: true });
    runSave(msg.mode, msg.tabId);
  }
  return false;
});

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).then(function (res) {
    if (!res || res.ok !== true) {
      throw new Error((res && res.error) || 'No response from page');
    }
    return res;
  });
}

async function ensureContentScript(tabId) {
  try {
    await sendToTab(tabId, { type: 'SB_PING' });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: CONTENT_SCRIPT_FILES
    });
    await sendToTab(tabId, { type: 'SB_PING' });
  }
}

async function setProgress(stage) {
  try {
    await chrome.storage.session.set({
      saveState: { state: 'saving', stage: stage, updatedAt: Date.now() }
    });
  } catch (e) { /* storage 실패는 치명적이지 않음 */ }
  try {
    await chrome.runtime.sendMessage({ type: 'SB_PROGRESS', stage: stage });
  } catch (e) { /* 팝업이 닫혀 있으면 수신자가 없다 */ }
}

async function announceDone(result) {
  try {
    await chrome.storage.session.set({
      saveState: { state: 'done', result: result, updatedAt: Date.now() }
    });
  } catch (e) { /* ignore */ }
  try {
    await chrome.runtime.sendMessage({ type: 'SB_DONE', result: result });
  } catch (e) { /* ignore */ }
}

/**
 * 스마트 페이지 분할 컴포저.
 *
 * 캡처 세그먼트들을 연속된 이미지 스트림으로 취급하고,
 * PDF 페이지를 자를 때 콘텐츠 한가운데가 아닌 "여백 행"에서 자른다.
 * (각 페이지의 55%~100% 구간에서 단색 행을 찾아 그 지점에서 분할,
 *  남은 부분은 다음 페이지 앞에 이어붙인다)
 * 이미지·버튼이 페이지 경계에 걸려 잘리는 문제를 줄여준다.
 */
const BREAK_SCAN_START_RATIO = 0.55;

function createComposer() {
  return { carry: null, pageHeight: 0, scale: 1, pages: [] };
}

async function canvasToPage(canvas, scale) {
  let target = canvas;
  if (scale < 1) {
    const outW = Math.max(1, Math.round(canvas.width * scale));
    const outH = Math.max(1, Math.round(canvas.height * scale));
    target = new OffscreenCanvas(outW, outH);
    target.getContext('2d').drawImage(
      canvas,
      0, 0, canvas.width, canvas.height,
      0, 0, outW, outH
    );
  }
  const blob = await target.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY / 100 });
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    width: target.width,
    height: target.height
  };
}

function sliceCanvas(source, top, height) {
  const out = new OffscreenCanvas(source.width, height);
  out.getContext('2d').drawImage(
    source,
    0, top, source.width, height,
    0, 0, source.width, height
  );
  return out;
}

/**
 * 세그먼트 bitmap의 srcRect 영역을 컴포저에 추가한다.
 * @param {ImageBitmap} bitmap
 * @param {{x:number,y:number,width:number,height:number}} srcRect
 *        캡처 이미지에서 사용할 영역 (window 모드: 전체, 컨테이너 모드: 컨테이너 영역)
 */
async function composerAdd(composer, bitmap, srcRect) {
  const sx = Math.max(0, srcRect.x);
  const sy = Math.max(0, srcRect.y);
  const segWidth = Math.min(srcRect.width, bitmap.width - sx);
  const segHeight = Math.min(srcRect.height, bitmap.height - sy);
  if (segWidth <= 4 || segHeight <= 4) {
    bitmap.close();
    return;
  }
  if (!composer.pageHeight) {
    composer.pageHeight = segHeight; // 첫 세그먼트 높이 = 기준 페이지 높이
    composer.scale = Math.min(1, MAX_PAGE_WIDTH_PX / segWidth);
  }

  const carryHeight = composer.carry ? composer.carry.height : 0;
  let current = new OffscreenCanvas(segWidth, carryHeight + segHeight);
  const ctx = current.getContext('2d');
  if (composer.carry) {
    ctx.drawImage(composer.carry, 0, 0);
  }
  ctx.drawImage(
    bitmap,
    sx, sy, segWidth, segHeight,
    0, carryHeight, segWidth, segHeight
  );
  bitmap.close();

  // 기준 높이를 넘는 동안 여백 행을 찾아 페이지로 잘라낸다
  while (current && current.height >= composer.pageHeight) {
    const scanTop = Math.floor(composer.pageHeight * BREAK_SCAN_START_RATIO);
    const scanHeight = composer.pageHeight - scanTop;
    let breakY = composer.pageHeight;
    try {
      const imageData = current
        .getContext('2d')
        .getImageData(0, scanTop, current.width, scanHeight);
      const row = SaveBothCapture.findBreakRow(imageData.data, current.width, scanHeight);
      if (row >= 0) {
        breakY = scanTop + row;
      }
    } catch (e) { /* 픽셀 분석 실패 시 기존 방식(꽉 채워 자르기)으로 진행 */ }

    composer.pages.push(await canvasToPage(sliceCanvas(current, 0, breakY), composer.scale));

    const remainderHeight = current.height - breakY;
    current = remainderHeight > 0 ? sliceCanvas(current, breakY, remainderHeight) : null;
  }
  composer.carry = current;
}

async function composerFinish(composer) {
  if (composer.carry && composer.carry.height > 4) {
    composer.pages.push(await canvasToPage(composer.carry, composer.scale));
  }
  composer.carry = null;
  return composer.pages;
}

async function capturePdfImages(tab, tabId, pageInfo) {
  const dpr = pageInfo.devicePixelRatio || 1;
  const viewportH = Math.max(1, Number(pageInfo.viewportHeight) || 1);
  const composer = createComposer();
  let lastCaptureAt = 0;
  let truncated = false;
  let y = 0;
  let captured = 0;

  // 가상화 페이지(ChatGPT 등)는 스크롤하는 동안 전체 높이가 계속 변하므로
  // 세그먼트를 미리 계산하지 않고, 매 스크롤마다 실시간 높이로 바닥 도달을 판단한다.
  while (true) {
    if (captured >= LIMITS.maxSegments || y >= LIMITS.maxCaptureHeight) {
      truncated = true;
      break;
    }

    // 첫 화면 캡처 후에는 fixed/sticky 요소를 숨겨
    // 이후 세그먼트에서 헤더가 콘텐츠를 가리는 것을 막는다.
    if (captured === 1) {
      try {
        await sendToTab(tabId, { type: 'SB_HIDE_STICKY' });
      } catch (e) { /* 실패해도 캡처는 계속 */ }
    }

    const scrollRes = await sendToTab(tabId, { type: 'SB_SCROLL_TO', y: y });
    let actualY = Number(scrollRes.scrollY) || 0;
    let livePageHeight =
      Number(scrollRes.pageHeight) || pageInfo.pageHeight || viewportH;

    // 첫 세그먼트: 가상화 페이지(ChatGPT 등)는 맨 위로 점프한 직후
    // 재렌더링이 끝날 때까지 이전 화면 잔상이 남는다.
    // 페이지 높이가 안정될 때까지 기다렸다가 캡처한다.
    if (captured === 0) {
      for (let attempt = 0; attempt < 6; attempt++) {
        await sleep(250);
        let check;
        try {
          check = await sendToTab(tabId, { type: 'SB_SCROLL_TO', y: y });
        } catch (e) {
          break;
        }
        const height = Number(check.pageHeight) || livePageHeight;
        const stable = Math.abs(height - livePageHeight) < 2;
        actualY = Number(check.scrollY) || 0;
        livePageHeight = height;
        if (stable) {
          break;
        }
      }
    }

    const estimatedTotal = Math.max(
      captured + 1,
      Math.min(
        Math.ceil(livePageHeight / viewportH),
        LIMITS.maxSegments,
        Math.ceil(LIMITS.maxCaptureHeight / viewportH)
      )
    );
    await setProgress(
      'Capturing PDF... (' + (captured + 1) + '/' + estimatedTotal + ')'
    );

    await sleep(LIMITS.scrollDelayMs);
    const wait = MIN_CAPTURE_INTERVAL_MS - (Date.now() - lastCaptureAt);
    if (wait > 0) {
      await sleep(wait);
    }
    lastCaptureAt = Date.now();

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: JPEG_QUALITY
    });
    const bytes = SaveBothCapture.dataUrlToUint8Array(dataUrl);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));

    // 스크롤이 요청 위치까지 가지 못했다면(페이지 끝) 겹치는 상단을 잘라낸다.
    const overlapCss = y - actualY;
    const cropTopPx = overlapCss > 0 ? Math.round(overlapCss * dpr) : 0;

    // 내부 스크롤 컨테이너 모드면 컨테이너의 화면 영역만 사용한다 (ChatGPT 등 SPA)
    const rect = pageInfo.containerRect;
    const srcRect = rect
      ? {
          x: Math.round(rect.x * dpr),
          y: Math.round(rect.y * dpr) + cropTopPx,
          width: Math.round(rect.width * dpr),
          height: Math.round(rect.height * dpr) - cropTopPx
        }
      : {
          x: 0,
          y: cropTopPx,
          width: bitmap.width,
          height: bitmap.height - cropTopPx
        };
    await composerAdd(composer, bitmap, srcRect);
    captured += 1;

    // 바닥 도달 판정
    if (overlapCss > 0) {
      break; // 스크롤이 요청 위치보다 못 갔다 = 이미 바닥
    }
    if (actualY + viewportH >= livePageHeight - 1) {
      break; // 다음 스크롤 위치가 페이지 끝을 넘는다
    }
    y = actualY + viewportH;
  }

  const images = await composerFinish(composer);
  if (!images.length) {
    throw new Error('No screen captures were produced');
  }
  return {
    images: images,
    truncated: truncated,
    // 축소 저장된 경우 PDF 페이지 크기(pt) 계산에 배율을 반영한다
    pixelRatio: dpr * (composer.scale || 1)
  };
}

async function runSave(mode, tabId) {
  saving = true;
  const result = { pdf: null, md: null, truncated: false, unsupported: false };

  try {
    const tab = await chrome.tabs.get(tabId);

    if (SaveBothErrors.isUnsupportedUrl(tab.url)) {
      result.unsupported = true;
    } else {
      await setProgress('Preparing page...');
      await ensureContentScript(tabId);
      const pageInfo = await sendToTab(tabId, { type: 'SB_GET_PAGE_INFO' });
      const baseName = SaveBothFilename.generateBaseFilename(
        pageInfo.title || tab.title || '',
        new Date()
      );

      // --- PDF ---
      if (mode === 'both' || mode === 'pdf') {
        try {
          await setProgress('Capturing PDF...');
          const capture = await capturePdfImages(tab, tabId, pageInfo);
          result.truncated = capture.truncated;

          await setProgress('Creating files...');
          const pdfBytes = SaveBothPdf.createPdfFromJpegs(capture.images, {
            devicePixelRatio: capture.pixelRatio || pageInfo.devicePixelRatio
          });

          await setProgress('Downloading files...');
          await SaveBothDownload.downloadBytes(pdfBytes, 'application/pdf', baseName + '.pdf');
          result.pdf = true;
        } catch (e) {
          console.error('SaveBoth: PDF save failed:', e);
          result.pdf = false;
        } finally {
          try {
            await sendToTab(tabId, { type: 'SB_SHOW_STICKY' });
          } catch (e) { /* 복원 실패는 무시 */ }
          try {
            await sendToTab(tabId, { type: 'SB_RESTORE_SCROLL', y: pageInfo.scrollY });
          } catch (e) { /* 스크롤 복원 실패는 무시 */ }
        }
      }

      // --- Markdown --- (PDF 실패와 무관하게 항상 시도)
      if (mode === 'both' || mode === 'md') {
        try {
          await setProgress('Extracting Markdown...');
          const extracted = await sendToTab(tabId, { type: 'SB_EXTRACT_MARKDOWN' });

          await setProgress('Creating files...');
          await setProgress('Downloading files...');
          await SaveBothDownload.downloadText(
            extracted.markdown,
            'text/markdown',
            baseName + '.md'
          );
          result.md = true;
        } catch (e) {
          console.error('SaveBoth: Markdown save failed:', e);
          result.md = false;
        }
      }
    }
  } catch (e) {
    console.error('SaveBoth: save failed:', e);
    if ((mode === 'both' || mode === 'pdf') && result.pdf === null) {
      result.pdf = false;
    }
    if ((mode === 'both' || mode === 'md') && result.md === null) {
      result.md = false;
    }
  } finally {
    saving = false;
  }

  await announceDone(result);
}
