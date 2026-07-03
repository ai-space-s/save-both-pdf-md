/**
 * SaveBoth - markdownExtractor
 * DOM에서 주요 콘텐츠를 찾아(article > main > [role=main] > 텍스트 밀도 > body)
 * Markdown으로 변환한다. DOM을 변경하지 않는다(읽기 전용 순회).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothMarkdown = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // PRD 12.5 제거 대상 + 안전상 제외(template/head)
  const REMOVE_TAGS = {
    SCRIPT: true, STYLE: true, NOSCRIPT: true, NAV: true, FOOTER: true,
    SVG: true, CANVAS: true, IFRAME: true, TEMPLATE: true, HEAD: true
  };

  const NBSP = String.fromCharCode(160);

  function isElement(node) {
    return !!node && node.nodeType === 1;
  }

  function isText(node) {
    return !!node && node.nodeType === 3;
  }

  function tagOf(node) {
    return (node.tagName || '').toUpperCase();
  }

  function shouldSkip(el) {
    if (REMOVE_TAGS[tagOf(el)]) {
      return true;
    }
    if (typeof el.getAttribute === 'function') {
      if (el.getAttribute('aria-hidden') === 'true') {
        return true;
      }
      if (el.hasAttribute && el.hasAttribute('hidden')) {
        return true;
      }
    }
    return false;
  }

  function collapse(text) {
    return String(text || '').split(NBSP).join(' ').replace(/\s+/g, ' ');
  }

  function resolveUrl(value, baseUrl) {
    if (!value) {
      return null;
    }
    const v = String(value).trim();
    if (!v || v.toLowerCase().indexOf('javascript:') === 0) {
      return null;
    }
    if (v.indexOf('data:') === 0) {
      // 초대형 inline data URL은 Markdown을 망가뜨리므로 생략
      return v.length <= 256 ? v : null;
    }
    try {
      return new URL(v, baseUrl || undefined).href;
    } catch (e) {
      return v;
    }
  }

  // ---------- 인라인 변환 ----------

  function inlineChildren(el, ctx) {
    let out = '';
    for (const child of el.childNodes) {
      out += convertInline(child, ctx);
    }
    return out;
  }

  function convertInline(node, ctx) {
    if (isText(node)) {
      return collapse(node.nodeValue);
    }
    if (!isElement(node) || shouldSkip(node)) {
      return '';
    }
    const tag = tagOf(node);
    switch (tag) {
      case 'BR':
        return '\n';
      case 'STRONG':
      case 'B': {
        const t = inlineChildren(node, ctx).trim();
        return t ? '**' + t + '**' : '';
      }
      case 'EM':
      case 'I': {
        const t = inlineChildren(node, ctx).trim();
        return t ? '*' + t + '*' : '';
      }
      case 'CODE': {
        const t = collapse(node.textContent).trim();
        return t ? '`' + t + '`' : '';
      }
      case 'A': {
        const text = inlineChildren(node, ctx).trim();
        const href = resolveUrl(node.getAttribute('href'), ctx.baseUrl);
        if (!href) {
          return text;
        }
        return '[' + (text || href) + '](' + href + ')';
      }
      case 'IMG': {
        const src = resolveUrl(node.getAttribute('src'), ctx.baseUrl);
        const alt = collapse(node.getAttribute('alt') || '').trim();
        if (!src) {
          return alt;
        }
        return '![' + alt + '](' + src + ')';
      }
      default:
        return inlineChildren(node, ctx);
    }
  }

  // ---------- 블록 변환 ----------

  function convertChildren(el, ctx) {
    let out = '';
    for (const child of el.childNodes) {
      out += convertBlock(child, ctx);
    }
    return out;
  }

  function convertBlock(node, ctx) {
    if (isText(node)) {
      const t = collapse(node.nodeValue);
      return t.trim() ? t : '';
    }
    if (!isElement(node) || shouldSkip(node)) {
      return '';
    }
    const tag = tagOf(node);

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.charAt(1));
      const text = inlineChildren(node, ctx).trim();
      return text ? '\n\n' + '#'.repeat(level) + ' ' + text + '\n\n' : '';
    }

    switch (tag) {
      case 'P': {
        const t = inlineChildren(node, ctx).trim();
        return t ? '\n\n' + t + '\n\n' : '';
      }
      case 'HR':
        return '\n\n---\n\n';
      case 'BR':
        return '\n';
      case 'PRE':
        return convertPre(node);
      case 'BLOCKQUOTE': {
        const inner = convertChildren(node, ctx)
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (!inner) {
          return '';
        }
        const quoted = inner
          .split('\n')
          .map(function (line) { return ('> ' + line).replace(/\s+$/g, ''); })
          .join('\n');
        return '\n\n' + quoted + '\n\n';
      }
      case 'UL':
      case 'OL': {
        const list = convertList(node, ctx, 0);
        return list ? '\n\n' + list + '\n\n' : '';
      }
      case 'TABLE':
        return convertTable(node, ctx);
      case 'IMG': {
        const md = convertInline(node, ctx);
        return md ? '\n\n' + md + '\n\n' : '';
      }
      case 'A':
      case 'STRONG':
      case 'B':
      case 'EM':
      case 'I':
      case 'CODE':
      case 'SPAN':
        return convertInline(node, ctx);
      default:
        return convertChildren(node, ctx);
    }
  }

  function convertPre(node) {
    const codeEl = typeof node.querySelector === 'function' ? node.querySelector('code') : null;
    const target = codeEl || node;
    let lang = '';
    const cls =
      ((codeEl && codeEl.getAttribute && codeEl.getAttribute('class')) || '') +
      ' ' +
      ((node.getAttribute && node.getAttribute('class')) || '');
    const m = cls.match(/(?:language|lang)-([A-Za-z0-9+#-]+)/);
    if (m) {
      lang = m[1];
    }
    const text = String(target.textContent || '').replace(/\n+$/g, '');
    if (!text.trim()) {
      return '';
    }
    const fence = text.indexOf('```') >= 0 ? '~~~~' : '```';
    return '\n\n' + fence + lang + '\n' + text + '\n' + fence + '\n\n';
  }

  function convertList(el, ctx, depth) {
    const ordered = tagOf(el) === 'OL';
    const indent = '  '.repeat(depth);
    let out = '';
    let index = 1;
    for (const child of el.children) {
      if (tagOf(child) !== 'LI') {
        continue;
      }
      let itemText = '';
      let nested = '';
      for (const n of child.childNodes) {
        const t = isElement(n) ? tagOf(n) : '';
        if (t === 'UL' || t === 'OL') {
          nested += convertList(n, ctx, depth + 1);
        } else {
          itemText += convertBlock(n, ctx);
        }
      }
      itemText = collapse(itemText).trim();
      const marker = ordered ? index + '. ' : '- ';
      if (itemText || nested) {
        out += indent + marker + itemText + '\n';
        if (nested) {
          out += nested;
        }
        index += 1;
      }
    }
    return out;
  }

  // 이 테이블 "자신의" 행만 수집한다 (중첩 테이블의 행 제외 — 중복 방지의 핵심)
  function ownRows(table) {
    const rows = [];
    for (const child of table.children) {
      const t = tagOf(child);
      if (t === 'TR') {
        rows.push(child);
      } else if (t === 'THEAD' || t === 'TBODY' || t === 'TFOOT') {
        for (const r of child.children) {
          if (tagOf(r) === 'TR') {
            rows.push(r);
          }
        }
      }
    }
    return rows;
  }

  const BLOCK_IN_CELL_SELECTOR =
    'p, div, table, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, article, section';

  /**
   * 레이아웃용 테이블 판별.
   * 이메일 뉴스레터/레거시 페이지는 <table>을 페이지 레이아웃으로 쓰므로
   * 데이터 표(파이프 테이블)가 아니라 일반 블록 흐름으로 변환해야 한다.
   */
  function isLayoutTable(table, rows) {
    if (typeof table.querySelector === 'function' && table.querySelector('table')) {
      return true; // 중첩 테이블 = 레이아웃
    }
    let hasTh = false;
    for (const row of rows) {
      for (const cell of row.children) {
        const t = tagOf(cell);
        if (t === 'TH') {
          hasTh = true;
        } else if (t !== 'TD') {
          continue;
        }
        if (cell.querySelector && cell.querySelector(BLOCK_IN_CELL_SELECTOR)) {
          return true; // 셀 안에 블록 요소가 있으면 레이아웃
        }
      }
    }
    return !hasTh; // 헤더 셀이 하나도 없으면 레이아웃으로 간주
  }

  function convertTable(table, ctx) {
    const trList = ownRows(table);
    if (!trList.length) {
      return convertChildren(table, ctx);
    }

    // 레이아웃 테이블: 셀 내용을 일반 블록처럼 위에서 아래로 이어서 변환
    if (isLayoutTable(table, trList)) {
      let out = '';
      for (const row of trList) {
        for (const cell of row.children) {
          const t = tagOf(cell);
          if (t === 'TH' || t === 'TD') {
            out += convertChildren(cell, ctx);
          }
        }
      }
      return out;
    }

    // 데이터 테이블: Markdown 파이프 테이블로 변환
    const rows = [];
    for (const tr of trList) {
      const cells = [];
      for (const cell of tr.children) {
        const t = tagOf(cell);
        if (t === 'TH' || t === 'TD') {
          const text = inlineChildren(cell, ctx)
            .replace(/\|/g, '\\|')
            .replace(/\s+/g, ' ')
            .trim();
          cells.push(text);
        }
      }
      if (cells.length) {
        rows.push(cells);
      }
    }
    if (!rows.length) {
      return '';
    }
    const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    rows.forEach(function (r) {
      while (r.length < width) {
        r.push('');
      }
    });
    function line(r) {
      return '| ' + r.join(' | ') + ' |';
    }
    const sep = '| ' + new Array(width).fill('---').join(' | ') + ' |';
    const body = rows.slice(1).map(line).join('\n');
    return '\n\n' + line(rows[0]) + '\n' + sep + (body ? '\n' + body : '') + '\n\n';
  }

  // ---------- 후처리 ----------

  // 코드 펜스 내부는 건드리지 않고 나머지만 공백 정리
  function cleanupMarkdown(md) {
    const parts = String(md).split(/(```[^]*?```|~~~~[^]*?~~~~)/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        parts[i] = parts[i]
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n');
      }
    }
    return parts.join('').trim();
  }

  // ---------- 본문 선택 ----------

  function textLength(el) {
    return collapse(el.textContent).trim().length;
  }

  function scoreElement(el) {
    const len = textLength(el);
    if (len < 200) {
      return 0;
    }
    let linkLen = 0;
    for (const a of el.querySelectorAll('a')) {
      linkLen += collapse(a.textContent).trim().length;
    }
    const pCount = el.querySelectorAll('p').length;
    return len - linkLen * 1.5 + pCount * 30;
  }

  function commonAncestor(a, b) {
    let node = a;
    while (node && !(node.contains && node.contains(b))) {
      node = node.parentElement;
    }
    return node;
  }

  /**
   * PRD 12.4: article > main > [role="main"] > 텍스트 밀도 > body
   *
   * ChatGPT처럼 대화 턴마다 <article>을 쓰는 페이지는
   * 가장 큰 article 하나만 고르면 대화 대부분이 유실되므로,
   * 여러 article의 합이 최대 article보다 충분히 크면 공통 조상을 선택한다.
   */
  function extractMainContent(doc) {
    const selectors = ['article', 'main', '[role="main"]'];
    for (const sel of selectors) {
      let best = null;
      let bestLen = 0;
      let totalLen = 0;
      const candidates = [];
      let els = [];
      try {
        els = doc.querySelectorAll(sel);
      } catch (e) {
        els = [];
      }
      for (const el of els) {
        if (shouldSkip(el)) {
          continue;
        }
        const len = textLength(el);
        if (len >= 20) {
          candidates.push(el);
          totalLen += len;
        }
        if (len > bestLen) {
          best = el;
          bestLen = len;
        }
      }

      // 대화형 페이지: 요소가 여러 개이고 합계가 최대 요소보다 훨씬 크면 전체를 포괄
      if (candidates.length >= 2 && totalLen > bestLen * 1.5) {
        let ancestor = candidates[0];
        for (const el of candidates) {
          ancestor = commonAncestor(ancestor, el) || (doc.body || ancestor);
        }
        if (ancestor && textLength(ancestor) >= 80) {
          return ancestor;
        }
      }

      if (best && bestLen >= 80) {
        return best;
      }
    }

    let best = null;
    let bestScore = 0;
    if (doc.body) {
      for (const el of doc.body.querySelectorAll('div, section, td')) {
        const s = scoreElement(el);
        if (s > bestScore) {
          best = el;
          bestScore = s;
        }
      }
    }
    if (best && bestScore >= 200) {
      return best;
    }
    return doc.body || doc.documentElement;
  }

  /**
   * 요소(또는 body)를 Markdown 텍스트로 변환.
   * @param {Element} rootEl
   * @param {{baseUrl?: string}} [options]
   */
  function htmlToMarkdown(rootEl, options) {
    if (!rootEl) {
      return '';
    }
    const ctx = { baseUrl: (options && options.baseUrl) || null };
    const raw = convertBlock(rootEl, ctx);
    const cleaned = cleanupMarkdown(raw);
    if (cleaned) {
      return cleaned;
    }
    // 최후 fallback: innerText/textContent
    const fallback = collapse(rootEl.innerText || rootEl.textContent).trim();
    return fallback;
  }

  return {
    extractMainContent: extractMainContent,
    htmlToMarkdown: htmlToMarkdown,
    REMOVE_TAGS: Object.keys(REMOVE_TAGS)
  };
});
