'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { waitForVisibleImages } = require('../../src/lib/imageReadiness');

function setup() {
  const dom = new JSDOM('<img src="/generated.png" loading="lazy">');
  const img = dom.window.document.querySelector('img');
  img.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });
  Object.defineProperty(img, 'complete', { configurable: true, value: false });
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 0 });
  return { dom, img };
}
const fast = { timeoutMs: 150, settleMs: 5, pollMs: 2 };

test('capture waits for a lazy image to load and decode and restores loading', async () => {
  const { dom, img } = setup();
  let decoded = false;
  img.decode = async () => { await new Promise(r => setTimeout(r, 15)); decoded = true; };
  const loading = waitForVisibleImages(dom.window.document, fast);
  setTimeout(() => {
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 512 });
  }, 15);
  assert.deepEqual(await loading, { pending: 0, failed: 0 });
  assert.equal(decoded, true);
  assert.equal(img.getAttribute('loading'), 'lazy');
  dom.window.close();
});

test('an image that never loads times out rather than hanging capture', async () => {
  const { dom, img } = setup();
  assert.deepEqual(await waitForVisibleImages(dom.window.document,
    { ...fast, timeoutMs: 20 }), { pending: 1, failed: 0 });
  assert.equal(img.getAttribute('loading'), 'lazy');
  dom.window.close();
});

test('broken images are reported separately', async () => {
  const { dom, img } = setup();
  Object.defineProperty(img, 'complete', { value: true });
  assert.deepEqual(await waitForVisibleImages(dom.window.document, fast), { pending: 0, failed: 1 });
  dom.window.close();
});

test('offscreen images do not delay the current capture', async () => {
  const { dom, img } = setup();
  img.getBoundingClientRect = () => ({ left: 0, top: 10000, right: 200, bottom: 10200, width: 200, height: 200 });
  assert.deepEqual(await waitForVisibleImages(dom.window.document, fast), { pending: 0, failed: 0 });
  assert.equal(img.getAttribute('loading'), 'lazy');
  dom.window.close();
});

test('images mounted after scrolling are discovered during settling', async () => {
  const { dom, img } = setup();
  img.remove();
  const loading = waitForVisibleImages(dom.window.document, { ...fast, settleMs: 30 });
  setTimeout(() => dom.window.document.body.append(img), 5);
  setTimeout(() => {
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 512 });
  }, 45);
  assert.deepEqual(await loading, { pending: 0, failed: 0 });
  assert.equal(img.getAttribute('loading'), 'lazy');
  dom.window.close();
});

test('a decode promise that never resolves is bounded by the timeout', async () => {
  const { dom, img } = setup();
  Object.defineProperty(img, 'complete', { value: true });
  Object.defineProperty(img, 'naturalWidth', { value: 512 });
  img.decode = () => new Promise(() => {});
  assert.deepEqual(await waitForVisibleImages(dom.window.document,
    { ...fast, timeoutMs: 20 }), { pending: 1, failed: 0 });
  dom.window.close();
});
