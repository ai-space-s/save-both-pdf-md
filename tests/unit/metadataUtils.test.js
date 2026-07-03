'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

const {
  extractMetadata,
  toIsoWithTimezone,
  buildFrontMatter,
  buildMarkdownDocument
} = require('../../src/lib/metadataUtils.js');

test('extractMetadata reads document title and url', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head><title>My Page</title></head><body></body></html>');
  const meta = extractMetadata(dom.window.document, 'https://example.com/post', new Date(2026, 6, 3, 10, 30, 0));
  assert.strictEqual(meta.title, 'My Page');
  assert.strictEqual(meta.sourceUrl, 'https://example.com/post');
  assert.match(meta.savedAt, /^2026-07-03T10:30:00[+-]\d{2}:\d{2}$/);
});

test('extractMetadata falls back to h1 then default title', () => {
  const withH1 = new JSDOM('<!DOCTYPE html><html><body><h1>  Heading   Title </h1></body></html>');
  assert.strictEqual(
    extractMetadata(withH1.window.document, 'https://example.com').title,
    'Heading Title'
  );

  const empty = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  assert.strictEqual(
    extractMetadata(empty.window.document, 'https://example.com').title,
    'Saved page'
  );
});

test('toIsoWithTimezone includes timezone offset', () => {
  const iso = toIsoWithTimezone(new Date(2026, 0, 1, 0, 0, 0));
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test('front matter contains required keys and escapes quotes', () => {
  const fm = buildFrontMatter({
    title: 'He said "hello"',
    sourceUrl: 'https://example.com/a?b=1',
    savedAt: '2026-07-03T10:30:00+09:00'
  });
  assert.ok(fm.startsWith('---'));
  assert.ok(fm.endsWith('---'));
  assert.ok(fm.includes('title: "He said \\"hello\\""'));
  assert.ok(fm.includes('source_url: "https://example.com/a?b=1"'));
  assert.ok(fm.includes('saved_at: "2026-07-03T10:30:00+09:00"'));
  assert.ok(fm.includes('saved_with: "SaveBoth"'));
});

test('buildMarkdownDocument follows PRD structure', () => {
  const doc = buildMarkdownDocument(
    { title: 'My Page', sourceUrl: 'https://example.com', savedAt: '2026-07-03T10:30:00+09:00' },
    'Body text here.'
  );
  assert.ok(doc.startsWith('---\n'));
  assert.ok(doc.includes('\n# My Page\n'));
  assert.ok(doc.includes('Body text here.'));
  assert.ok(!doc.includes('summary'), 'no summary section');
});
