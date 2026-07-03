'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  sanitizeFilename,
  generateTimestamp,
  generateBaseFilename
} = require('../../src/lib/filenameUtils.js');

test('unsafe filename characters are replaced', () => {
  assert.strictEqual(
    sanitizeFilename('ChatGPT: Codex / CLI? Guide*'),
    'ChatGPT_Codex_CLI_Guide'
  );
});

test('all PRD unsafe characters are removed', () => {
  const unsafe = 'a\\b/c:d*e?f"g<h>i|j#k%l&m{n}o$p!q\'r@s+t`u=v';
  const result = sanitizeFilename(unsafe);
  for (const ch of '\\/:*?"<>|#%&{}$!\'@+`=') {
    assert.ok(!result.includes(ch), 'should not contain ' + ch);
  }
  assert.strictEqual(result, 'a_b_c_d_e_f_g_h_i_j_k_l_m_n_o_p_q_r_s_t_u_v');
});

test('empty title uses saved-page', () => {
  assert.strictEqual(sanitizeFilename(''), 'saved-page');
  assert.strictEqual(sanitizeFilename(null), 'saved-page');
  assert.strictEqual(sanitizeFilename(undefined), 'saved-page');
  assert.strictEqual(sanitizeFilename('***???'), 'saved-page');
  assert.strictEqual(sanitizeFilename('   '), 'saved-page');
});

test('consecutive underscores collapse to one', () => {
  assert.strictEqual(sanitizeFilename('a  -  b___c'), 'a_-_b_c');
});

test('leading and trailing whitespace/underscores are trimmed', () => {
  assert.strictEqual(sanitizeFilename('  _hello world_  '), 'hello_world');
});

test('very long titles are truncated', () => {
  const long = 'word '.repeat(100);
  const result = sanitizeFilename(long);
  assert.ok(result.length <= 80, 'length is ' + result.length);
  assert.ok(!result.endsWith('_'));
});

test('korean titles are preserved', () => {
  assert.strictEqual(sanitizeFilename('크롬 확장 개발 가이드'), '크롬_확장_개발_가이드');
});

test('generateTimestamp formats as YYYY-MM-DD_HH-mm', () => {
  const d = new Date(2026, 6, 3, 10, 30, 45);
  assert.strictEqual(generateTimestamp(d), '2026-07-03_10-30');
});

test('generateTimestamp pads single digits', () => {
  const d = new Date(2026, 0, 5, 9, 7);
  assert.strictEqual(generateTimestamp(d), '2026-01-05_09-07');
});

test('generateBaseFilename combines sanitized title and timestamp', () => {
  const d = new Date(2026, 6, 3, 10, 30);
  assert.strictEqual(
    generateBaseFilename('ChatGPT: Codex / CLI? Guide*', d),
    'ChatGPT_Codex_CLI_Guide_2026-07-03_10-30'
  );
});

test('generateBaseFilename with empty title uses fallback', () => {
  const d = new Date(2026, 6, 3, 10, 30);
  assert.strictEqual(generateBaseFilename('', d), 'saved-page_2026-07-03_10-30');
});
