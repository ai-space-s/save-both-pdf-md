/**
 * SaveBoth - captureUtils
 * PDF 캡처 세그먼트 계산, JPEG 크기 파싱, data URL 변환 유틸.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothCapture = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // 안전 제한 (긴 ChatGPT 대화 등을 고려해 상향 조정됨)
  const DEFAULT_LIMITS = {
    maxCaptureHeight: 300000,
    maxSegments: 400,
    scrollDelayMs: 250
  };

  /**
   * 페이지를 viewport 단위 세그먼트로 나눈다.
   * @returns {{segments: Array<{y:number}>, truncated: boolean}}
   */
  function computeSegments(pageHeight, viewportHeight, limits) {
    const opts = Object.assign({}, DEFAULT_LIMITS, limits || {});
    const page = Math.max(0, Number(pageHeight) || 0);
    const viewport = Math.max(1, Number(viewportHeight) || 1);
    const effectiveHeight = Math.min(page, opts.maxCaptureHeight);

    const segments = [];
    let y = 0;
    while (y < effectiveHeight && segments.length < opts.maxSegments) {
      segments.push({ y: y });
      y += viewport;
    }
    if (segments.length === 0) {
      segments.push({ y: 0 });
    }
    const truncated = page > opts.maxCaptureHeight || y < effectiveHeight;
    return { segments: segments, truncated: truncated };
  }

  /**
   * JPEG 바이트에서 width/height를 읽는다 (SOF 마커 파싱).
   */
  function getJpegDimensions(bytes) {
    if (!bytes || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) {
      return null;
    }
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 255) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      // SOF0~SOF15 (DHT 0xC4, JPG 0xC8, DAC 0xCC 제외)
      if (marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204) {
        return {
          height: (bytes[i + 5] << 8) | bytes[i + 6],
          width: (bytes[i + 7] << 8) | bytes[i + 8]
        };
      }
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) {
        i += 2;
        continue;
      }
      const segLength = (bytes[i + 2] << 8) | bytes[i + 3];
      if (segLength < 2) {
        return null;
      }
      i += 2 + segLength;
    }
    return null;
  }

  /**
   * RGBA 픽셀 데이터에서 "페이지를 잘라도 안전한" 여백 행을 찾는다.
   * 아래쪽부터 위로 스캔하며, 가로 전체가 (거의) 단색인 행이
   * runLength개 연속되면 그 run의 중간 행 인덱스를 반환한다. 없으면 -1.
   *
   * 이미지·버튼이 페이지 경계에서 잘리는 것을 막기 위한 스마트 분할용.
   *
   * @param {Uint8Array|Uint8ClampedArray} data - RGBA (width*height*4)
   * @param {number} width
   * @param {number} height
   * @param {{xStep?:number, tolerance?:number, runLength?:number}} [options]
   */
  function findBreakRow(data, width, height, options) {
    const opts = Object.assign({ xStep: 6, tolerance: 16, runLength: 10 }, options || {});
    const tol = opts.tolerance;

    function rowColorIfUniform(y) {
      const rowStart = y * width * 4;
      const r0 = data[rowStart];
      const g0 = data[rowStart + 1];
      const b0 = data[rowStart + 2];
      for (let x = opts.xStep; x < width; x += opts.xStep) {
        const i = rowStart + x * 4;
        if (
          Math.abs(data[i] - r0) > tol ||
          Math.abs(data[i + 1] - g0) > tol ||
          Math.abs(data[i + 2] - b0) > tol
        ) {
          return null;
        }
      }
      return [r0, g0, b0];
    }

    let run = 0;
    let ref = null;
    for (let y = height - 1; y >= 0; y--) {
      const color = rowColorIfUniform(y);
      const matchesRef =
        color &&
        (!ref ||
          (Math.abs(color[0] - ref[0]) <= tol &&
            Math.abs(color[1] - ref[1]) <= tol &&
            Math.abs(color[2] - ref[2]) <= tol));
      if (color && (run === 0 || matchesRef)) {
        if (run === 0) {
          ref = color;
        }
        run += 1;
        if (run >= opts.runLength) {
          return y + (opts.runLength >> 1); // run의 중간 행
        }
      } else {
        run = color ? 1 : 0;
        ref = color;
      }
    }
    return -1;
  }

  /**
   * data URL(base64)을 Uint8Array로 변환한다.
   */
  function dataUrlToUint8Array(dataUrl) {
    const comma = String(dataUrl).indexOf(',');
    if (comma < 0) {
      throw new Error('Invalid data URL');
    }
    const b64 = String(dataUrl).slice(comma + 1);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  return {
    DEFAULT_LIMITS: DEFAULT_LIMITS,
    computeSegments: computeSegments,
    getJpegDimensions: getJpegDimensions,
    findBreakRow: findBreakRow,
    dataUrlToUint8Array: dataUrlToUint8Array
  };
});
