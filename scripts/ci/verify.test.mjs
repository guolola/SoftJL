// Ensures parallel CI partitions preserve the complete local validation gate.
import assert from 'node:assert/strict';
import test from 'node:test';
import { scriptsForGroup, verificationScripts } from './verify.mjs';

test('server and web groups cover every validation script exactly once', () => {
  const scripts = [...scriptsForGroup('server'), ...scriptsForGroup('web')];
  assert.deepEqual([...scripts].sort(), [...verificationScripts].sort());
  assert.equal(new Set(scripts).size, scripts.length);
  assert.deepEqual(scriptsForGroup('web'), ['test:web']);
  assert.deepEqual(scriptsForGroup(), verificationScripts);
  assert.throws(() => scriptsForGroup('typo'), /Unknown validation group/);
});
