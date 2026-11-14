'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('capture preparation keeps the message open and returns geometry after image loading', async () => {
  const dom = new JSDOM('<main>Conversation</main>', { runScripts: 'outside-only' });
  const win = dom.window;
  let listener;
  let finishLoading;
  win.chrome = { runtime: { onMessage: { addListener(fn) { listener = fn; } } } };
  win.SaveBothImages = {
    waitForVisibleImages: () => new Promise(resolve => { finishLoading = resolve; })
  };
  win.eval(fs.readFileSync(path.join(__dirname, '../../src/content/contentScript.js'), 'utf8'));
  let response;
  const result = new Promise(resolve => {
    assert.equal(listener({ type: 'SB_PREPARE_CAPTURE' }, {}, value => {
      response = value;
      resolve();
    }), true);
  });
  assert.equal(response, undefined, 'must not capture before images finish');
  Object.defineProperty(win.document.documentElement, 'scrollHeight', { value: 2500 });
  Object.defineProperty(win, 'scrollY', { value: 1200 });
  finishLoading({ pending: 1, failed: 1 });
  await result;
  assert.equal(response.ok, true);
  assert.equal(response.pageHeight, 2500);
  assert.equal(response.scrollY, 1200);
  assert.equal(response.incompleteImages, 2);
  assert.equal(response.containerRect, null);
  dom.window.close();
});
