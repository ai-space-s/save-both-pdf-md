'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { isUnsupportedUrl, aggregateSaveStatus } = require('../../src/lib/errorUtils.js');

test('unsupported chrome URL', () => {
  assert.strictEqual(isUnsupportedUrl('chrome://extensions'), true);
});

test('normal HTTPS URL', () => {
  assert.strictEqual(isUnsupportedUrl('https://example.com'), false);
});

test('normal HTTP URL is supported', () => {
  assert.strictEqual(isUnsupportedUrl('http://example.com/page'), false);
});

test('all PRD-listed schemes are unsupported', () => {
  const urls = [
    'chrome://settings',
    'chrome-extension://abcdef/popup.html',
    'edge://settings',
    'about:blank',
    'file:///C:/Users/test/doc.html'
  ];
  for (const url of urls) {
    assert.strictEqual(isUnsupportedUrl(url), true, url + ' should be unsupported');
  }
});

test('empty or missing URL is unsupported', () => {
  assert.strictEqual(isUnsupportedUrl(''), true);
  assert.strictEqual(isUnsupportedUrl(null), true);
  assert.strictEqual(isUnsupportedUrl(undefined), true);
});

test('aggregate: both saved -> success', () => {
  const agg = aggregateSaveStatus({ pdf: true, md: true });
  assert.strictEqual(agg.status, 'success');
  assert.strictEqual(agg.headline, 'Saved successfully.');
  assert.deepStrictEqual(agg.lines, ['PDF: saved', 'Markdown: saved']);
});

test('aggregate: pdf only failed -> partial', () => {
  const agg = aggregateSaveStatus({ pdf: false, md: true });
  assert.strictEqual(agg.status, 'partial');
  assert.strictEqual(agg.headline, 'Partially saved.');
  assert.deepStrictEqual(agg.lines, ['PDF: failed', 'Markdown: saved']);
});

test('aggregate: markdown failed -> partial', () => {
  const agg = aggregateSaveStatus({ pdf: true, md: false });
  assert.strictEqual(agg.status, 'partial');
  assert.deepStrictEqual(agg.lines, ['PDF: saved', 'Markdown: failed']);
});

test('aggregate: both failed -> failed with guidance', () => {
  const agg = aggregateSaveStatus({ pdf: false, md: false });
  assert.strictEqual(agg.status, 'failed');
  assert.strictEqual(agg.headline, 'Save failed.');
  assert.strictEqual(agg.detail, 'Please try again on a supported webpage.');
});

test('aggregate: single-mode save shows only that line', () => {
  const pdfOnly = aggregateSaveStatus({ pdf: true, md: null });
  assert.strictEqual(pdfOnly.status, 'success');
  assert.deepStrictEqual(pdfOnly.lines, ['PDF: saved']);

  const mdOnly = aggregateSaveStatus({ pdf: null, md: true });
  assert.strictEqual(mdOnly.status, 'success');
  assert.deepStrictEqual(mdOnly.lines, ['Markdown: saved']);
});

test('aggregate: nothing attempted -> failed', () => {
  const agg = aggregateSaveStatus({ pdf: null, md: null });
  assert.strictEqual(agg.status, 'failed');
});
