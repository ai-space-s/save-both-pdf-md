'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { extractMainContent, htmlToMarkdown } = require('../../src/lib/markdownExtractor.js');
const { extractMetadata, buildMarkdownDocument } = require('../../src/lib/metadataUtils.js');

const FIXTURE_URL = 'https://example.com/articles/post';

test('an image-only ChatGPT turn is kept alongside a long text answer', () => {
  const dom = new JSDOM('<main><article><p>' + 'Long answer. '.repeat(100) +
    '</p></article><article><button><img src="/generated.png" alt="Generated image"></button></article></main>');
  const main = extractMainContent(dom.window.document);
  const md = htmlToMarkdown(main, { baseUrl: FIXTURE_URL });
  assert.ok(md.includes('Long answer.'));
  assert.ok(md.includes('![Generated image](https://example.com/generated.png)'));
  dom.window.close();
});

test('responsive images use the source actually displayed by the browser', () => {
  const dom = new JSDOM('<img src="/placeholder.png" alt="Generated image">');
  Object.defineProperty(dom.window.document.querySelector('img'), 'currentSrc', {
    value: 'https://example.com/full-image.png'
  });
  const md = htmlToMarkdown(dom.window.document.body, { baseUrl: FIXTURE_URL });
  assert.ok(md.includes('https://example.com/full-image.png'));
  assert.ok(!md.includes('placeholder.png'));
  dom.window.close();
});

function loadFixture(name) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
  return new JSDOM(html, { url: FIXTURE_URL });
}

function fixtureToMarkdown(name) {
  const dom = loadFixture(name);
  const doc = dom.window.document;
  const main = extractMainContent(doc);
  return htmlToMarkdown(main, { baseUrl: FIXTURE_URL });
}

test('markdown includes title and source URL', () => {
  const dom = loadFixture('simple-article.html');
  const doc = dom.window.document;
  const meta = extractMetadata(doc, FIXTURE_URL, new Date(2026, 6, 3, 10, 30));
  const body = htmlToMarkdown(extractMainContent(doc), { baseUrl: FIXTURE_URL });
  const markdown = buildMarkdownDocument(meta, body);

  assert.ok(markdown.includes('title: "Simple Article - SaveBoth Fixture"'));
  assert.ok(markdown.includes('source_url: "' + FIXTURE_URL + '"'));
  assert.ok(markdown.includes('saved_at:'));
  assert.ok(markdown.includes('saved_with: "SaveBoth"'));
  assert.ok(markdown.includes('Archiving web pages locally'));
});

test('article element is preferred over nav and footer', () => {
  const md = fixtureToMarkdown('simple-article.html');
  assert.ok(md.includes('# Understanding Web Page Archiving'));
  assert.ok(md.includes('## Why archive locally'));
  assert.ok(!md.includes('Copyright 2026'), 'footer must be excluded');
});

test('links are converted with absolute URLs', () => {
  const md = fixtureToMarkdown('simple-article.html');
  assert.ok(md.includes('[archiving guide](https://example.com/docs/archiving-guide)'));
});

test('lists and blockquotes are preserved', () => {
  const md = fixtureToMarkdown('simple-article.html');
  assert.ok(md.includes('- No server upload required'));
  assert.ok(md.includes('- Works offline'));
  assert.ok(md.includes('> Save what you see, keep what you need.'));
});

test('code block is preserved', () => {
  const md = fixtureToMarkdown('code-blocks.html');
  assert.ok(md.includes('```javascript'), 'fenced block with language');
  assert.ok(md.includes('async function loadData(url) {'));
  assert.ok(md.includes('```bash'));
  assert.ok(md.includes('npm install'));
  assert.ok(md.includes('`await`'), 'inline code preserved');
});

test('table content is preserved', () => {
  const md = fixtureToMarkdown('tables.html');
  assert.ok(md.includes('| Code | Name | Meaning |'));
  assert.ok(md.includes('| --- | --- | --- |'));
  assert.ok(md.includes('| 404 | Not Found | The resource does not exist |'));
});

test('images keep alt text and resolved URLs', () => {
  const md = fixtureToMarkdown('images.html');
  assert.ok(md.includes('![A mountain at sunrise](https://example.com/images/mountain.jpg)'));
  assert.ok(md.includes('![Architecture diagram](https://example.com/articles/diagram.png)'));
  assert.ok(md.includes('![](https://cdn.example.com/photo.webp)'));
});

test('sticky header nav links are excluded', () => {
  const md = fixtureToMarkdown('sticky-header.html');
  assert.ok(md.includes('# Article Under a Sticky Header'));
  assert.ok(!md.includes('NavProductsLink'));
  assert.ok(!md.includes('NavPricingLink'));
  assert.ok(!md.includes('NavLoginLink'));
});

test('long article keeps every chapter heading', () => {
  const md = fixtureToMarkdown('long-article.html');
  for (let i = 1; i <= 6; i++) {
    assert.ok(md.includes('## Chapter ' + i), 'missing chapter ' + i);
  }
});

test('no-main-content page falls back to density selection', () => {
  const md = fixtureToMarkdown('no-main-content.html');
  assert.ok(md.includes('fall back to text density analysis'));
  assert.ok(md.includes('scoring'));
});

test('nested layout tables are flattened to blocks without duplication', () => {
  const md = fixtureToMarkdown('nested-layout-table.html');

  // 레이아웃 테이블은 파이프 테이블로 렌더링되지 않아야 한다
  assert.ok(!md.includes('| ---'), 'layout table must not become a pipe table');

  // 각 문구는 정확히 한 번만 나타나야 한다 (중첩 테이블 중복 버그 회귀 테스트)
  function countOf(haystack, needle) {
    return haystack.split(needle).length - 1;
  }
  assert.strictEqual(countOf(md, 'UniquePhraseAlpha'), 1);
  assert.strictEqual(countOf(md, 'UniquePhraseBeta'), 1);
  assert.strictEqual(countOf(md, '# Newsletter Issue 42'), 1);

  // 블록 구조는 유지되어야 한다
  assert.ok(md.includes('[dexterity research](https://example.com/articles/dexterity)'));
  assert.ok(md.includes('![Robot hand prototype](https://cdn.example.com/robot-hand.jpg)'));
});

test('data tables with th headers still become pipe tables', () => {
  const md = fixtureToMarkdown('tables.html');
  assert.ok(md.includes('| Code | Name | Meaning |'));
  assert.ok(md.includes('| --- | --- | --- |'));
});

test('chat pages with one article per turn keep the whole conversation', () => {
  const md = fixtureToMarkdown('chat-articles.html');
  // 가장 긴 article 하나가 아니라 모든 대화 턴이 포함되어야 한다
  assert.ok(md.includes('UserQuestionMarker'), 'first user turn missing');
  assert.ok(md.includes('AssistantAnswerMarker'), 'assistant turn missing');
  assert.ok(md.includes('SecondQuestionMarker'), 'second user turn missing');
  assert.ok(md.includes('```text'), 'code block in assistant turn missing');
});

test('single-article pages still select just the article', () => {
  const md = fixtureToMarkdown('simple-article.html');
  assert.ok(md.includes('# Understanding Web Page Archiving'));
  assert.ok(!md.includes('Copyright 2026'), 'footer must stay excluded');
});

test('script and style tags never leak into markdown', () => {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><article><h1>Title text here for length</h1>' +
    '<p>Real paragraph content that is long enough to be selected as the body.</p>' +
    '<script>var secretScript = 1;</script>' +
    '<style>.hidden { color: red; }</style>' +
    '</article></body></html>',
    { url: FIXTURE_URL }
  );
  const md = htmlToMarkdown(extractMainContent(dom.window.document), { baseUrl: FIXTURE_URL });
  assert.ok(!md.includes('secretScript'));
  assert.ok(!md.includes('color: red'));
  assert.ok(md.includes('Real paragraph content'));
});
