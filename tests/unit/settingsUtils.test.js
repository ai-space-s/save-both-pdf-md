'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { DEFAULT_SETTINGS } = require('../../src/lib/settingsUtils.js');

test('DEFAULT_SETTINGS has no folder selected and askEachTime off', () => {
  assert.strictEqual(DEFAULT_SETTINGS.folderName, '');
  assert.strictEqual(DEFAULT_SETTINGS.askEachTime, false);
});
