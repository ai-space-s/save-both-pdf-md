/**
 * SaveBoth - metadataUtils
 * 페이지 메타데이터(제목/URL/저장시각) 추출과 Markdown front matter 생성.
 * 별도의 metadata 파일은 절대 만들지 않는다. (Markdown 내부 front matter 전용)
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothMetadata = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const DEFAULT_TITLE = 'Saved page';

  function pad2(n) {
    return String(Math.abs(n)).padStart(2, '0');
  }

  // 타임존 오프셋이 포함된 ISO 문자열: 2026-07-03T10:30:00+09:00
  function toIsoWithTimezone(date) {
    const d = date instanceof Date ? date : new Date();
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMin);
    return (
      d.getFullYear() +
      '-' +
      pad2(d.getMonth() + 1) +
      '-' +
      pad2(d.getDate()) +
      'T' +
      pad2(d.getHours()) +
      ':' +
      pad2(d.getMinutes()) +
      ':' +
      pad2(d.getSeconds()) +
      sign +
      pad2(Math.floor(absMin / 60)) +
      ':' +
      pad2(absMin % 60)
    );
  }

  /**
   * document에서 제목/URL/저장시각을 추출한다.
   * @param {Document} doc
   * @param {string} url - location.href (테스트에서는 직접 전달)
   * @param {Date} [now]
   */
  function extractMetadata(doc, url, now) {
    let title = '';
    if (doc) {
      title = String(doc.title || '').trim();
      if (!title && typeof doc.querySelector === 'function') {
        const h1 = doc.querySelector('h1');
        if (h1) {
          title = String(h1.textContent || '').replace(/\s+/g, ' ').trim();
        }
      }
    }
    return {
      title: title || DEFAULT_TITLE,
      sourceUrl: String(url || ''),
      savedAt: toIsoWithTimezone(now)
    };
  }

  function yamlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\r\n]+/g, ' ');
  }

  function buildFrontMatter(meta) {
    const m = meta || {};
    return [
      '---',
      'title: "' + yamlEscape(m.title) + '"',
      'source_url: "' + yamlEscape(m.sourceUrl) + '"',
      'saved_at: "' + yamlEscape(m.savedAt) + '"',
      'saved_with: "SaveBoth"',
      '---'
    ].join('\n');
  }

  /**
   * PRD 12.3 구조의 최종 Markdown 문서 생성.
   */
  function buildMarkdownDocument(meta, bodyMarkdown) {
    const m = meta || {};
    const body = String(bodyMarkdown || '').trim();
    return (
      buildFrontMatter(m) +
      '\n\n# ' +
      String(m.title || DEFAULT_TITLE).replace(/[\r\n]+/g, ' ') +
      '\n\n' +
      body +
      '\n'
    );
  }

  return {
    extractMetadata: extractMetadata,
    toIsoWithTimezone: toIsoWithTimezone,
    buildFrontMatter: buildFrontMatter,
    buildMarkdownDocument: buildMarkdownDocument,
    DEFAULT_TITLE: DEFAULT_TITLE
  };
});
