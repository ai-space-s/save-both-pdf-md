'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  computeSegments,
  getJpegDimensions,
  findBreakRow,
  DEFAULT_LIMITS
} = require('../../src/lib/captureUtils.js');

// 테스트용 RGBA 픽셀 버퍼 생성: rowFn(y) => [r,g,b] 또는 'noise'
function makePixels(width, height, rowFn) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const spec = rowFn(y);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (spec === 'noise') {
        const v = (x * 37 + y * 91) % 256; // 가로로 값이 크게 변하는 행
        data[i] = v;
        data[i + 1] = 255 - v;
        data[i + 2] = (v * 3) % 256;
      } else {
        data[i] = spec[0];
        data[i + 1] = spec[1];
        data[i + 2] = spec[2];
      }
      data[i + 3] = 255;
    }
  }
  return data;
}

test('short page produces a single segment', () => {
  const plan = computeSegments(500, 800);
  assert.deepStrictEqual(plan.segments, [{ y: 0 }]);
  assert.strictEqual(plan.truncated, false);
});

test('long page is split into viewport-sized segments', () => {
  const plan = computeSegments(2500, 800);
  assert.deepStrictEqual(
    plan.segments.map((s) => s.y),
    [0, 800, 1600, 2400]
  );
  assert.strictEqual(plan.truncated, false);
});

test('page taller than maxCaptureHeight is truncated', () => {
  const plan = computeSegments(DEFAULT_LIMITS.maxCaptureHeight * 3, 1000);
  assert.ok(plan.segments.length <= DEFAULT_LIMITS.maxSegments);
  assert.strictEqual(plan.truncated, true);
  const lastY = plan.segments[plan.segments.length - 1].y;
  assert.ok(lastY < DEFAULT_LIMITS.maxCaptureHeight);
});

test('segment count never exceeds maxSegments', () => {
  // maxCaptureHeight 안에서도 세그먼트 수가 maxSegments를 넘으면 제한되어야 함
  const plan = computeSegments(DEFAULT_LIMITS.maxCaptureHeight, 100);
  assert.strictEqual(plan.segments.length, DEFAULT_LIMITS.maxSegments);
  assert.strictEqual(plan.truncated, true);
});

test('getJpegDimensions parses SOF0 marker', () => {
  // 최소 JPEG 구조: SOI + APP0(빈) + SOF0(1280x720) 헤더
  const bytes = new Uint8Array([
    255, 216, // SOI
    255, 224, 0, 4, 0, 0, // APP0, length 4
    255, 192, 0, 17, 8, // SOF0, length 17, precision 8
    2, 208, // height 720
    5, 0, // width 1280
    3, 1, 34, 0, 2, 17, 1, 3, 17, 1 // components
  ]);
  const dims = getJpegDimensions(bytes);
  assert.deepStrictEqual(dims, { width: 1280, height: 720 });
});

test('getJpegDimensions rejects non-JPEG data', () => {
  assert.strictEqual(getJpegDimensions(new Uint8Array([1, 2, 3, 4])), null);
  assert.strictEqual(getJpegDimensions(null), null);
});

test('findBreakRow: all-white window breaks near the bottom', () => {
  const w = 120;
  const h = 60;
  const data = makePixels(w, h, () => [255, 255, 255]);
  const row = findBreakRow(data, w, h);
  assert.ok(row >= h - 12 && row < h, 'row was ' + row);
});

test('findBreakRow: busy content has no safe break', () => {
  const w = 120;
  const h = 60;
  const data = makePixels(w, h, () => 'noise');
  assert.strictEqual(findBreakRow(data, w, h), -1);
});

test('findBreakRow: finds the whitespace band between content blocks', () => {
  const w = 120;
  const h = 100;
  // 0~79 콘텐츠, 80~89 흰 여백, 90~99 콘텐츠
  const data = makePixels(w, h, (y) => (y >= 80 && y <= 89 ? [255, 255, 255] : 'noise'));
  const row = findBreakRow(data, w, h);
  assert.ok(row >= 80 && row <= 89, 'row was ' + row);
});

test('findBreakRow: ignores uniform bands shorter than runLength', () => {
  const w = 120;
  const h = 100;
  // 여백이 4행뿐이면 (기본 runLength 10 미만) 분할점이 없어야 한다
  const data = makePixels(w, h, (y) => (y >= 80 && y <= 83 ? [255, 255, 255] : 'noise'));
  assert.strictEqual(findBreakRow(data, w, h), -1);
});
