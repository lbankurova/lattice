/**
 * Test for B4 fix: SUBSYSTEM_RE matches 2-3 digits + optional sub-letter.
 *
 * Pre-fix `\bS(\d{2})\b` matched exactly 2 digits, so S100+, S5, S05a
 * etc. were silently invisible to subsystem-extraction. The 25-subsystem
 * manifest is approaching S99; growth past 99 will be silently dropped
 * unless the regex tracks. Sub-lettered IDs (S05a, S10b) are a parallel
 * convention that was never matched at all.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractSubsystemsForTest } from './coherence.js';

test('B4: 2-digit subsystem still matches (no regression)', () => {
  assert.deepEqual(extractSubsystemsForTest('S05 and S10'), ['S05', 'S10']);
});

test('B4: 3-digit subsystem now matches (S100, S101, ...)', () => {
  assert.deepEqual(extractSubsystemsForTest('S100 affects S101'), ['S100', 'S101']);
});

test('B4: sub-lettered subsystem now matches (S05a, S10b)', () => {
  assert.deepEqual(extractSubsystemsForTest('S05a downstream of S10b'), ['S05a', 'S10b']);
});

test('B4: mixed shapes coexist', () => {
  // Realistic system-manifest line referencing several IDs. Result is
  // lexicographically sorted (the helper uses [...set].sort()), so
  // 'S100' lands between 'S05a' and 'S10b' under string comparison.
  assert.deepEqual(
    extractSubsystemsForTest('Touches S05, S10b, S100, and S05a'),
    ['S05', 'S05a', 'S100', 'S10b'],
  );
});

test('B4: 1-digit "S5" still does not match (spec preserves \\d{2,3})', () => {
  // Per the spec the fix is `\bS\d{2,3}[a-z]?\b`; 1-digit IDs remain
  // unmatched. This is an explicit choice -- the canonical form is
  // zero-padded (S05, not S5). Documenting via test to make the bound
  // explicit.
  assert.deepEqual(extractSubsystemsForTest('S5 and S15'), ['S15']);
});

test('B4: 4-digit "S1000" does not match (upper bound)', () => {
  // Future growth past S999 will need another widening; until then,
  // 4-digit IDs are dropped. Documenting the bound via test.
  assert.deepEqual(extractSubsystemsForTest('S1000 referenced'), []);
});

test('B4: bare letters and noise do not match', () => {
  assert.deepEqual(extractSubsystemsForTest('SXY and stuff S1'), []);
});
