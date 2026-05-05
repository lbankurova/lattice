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
import {
  extractSubsystemsForTest,
  checkCoherence,
  setCoherenceWarnSink,
} from './coherence.js';
import type { TopicState, ScienceFlag } from './coherence.js';

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

// ── B5: SCIENCE-FLAG fan-out fix ─────────────────────────────

function mkSf(opts: Partial<ScienceFlag> = {}): ScienceFlag {
  return {
    description: opts.description ?? 'illustrative SF description',
    subsystems: opts.subsystems ?? [],
    resolved: opts.resolved ?? false,
    scope: opts.scope ?? 'active',
  };
}

function mkTopic(opts: Partial<TopicState> & { topic: string }): TopicState {
  return {
    topic: opts.topic,
    phase: opts.phase ?? 'build',
    currentStep: '',
    startedAt: new Date().toISOString(),
    lifecycleState: 'active',
    pauseReason: '',
    hasLock: false,
    lockHolder: null,
    subsystems: opts.subsystems ?? [],
    scienceFlags: opts.scienceFlags ?? [],
    breaks: [],
    propagates: [],
    prerequisites: [],
    crossTopicInteractions: [],
    keyDecisions: [],
    probeResult: '',
    lastCheckpoint: new Date().toISOString(),
    stateFile: '',
    docRefs: [],
    subsystemInteractions: [],
  };
}

test('B5: SF with empty subsystems does NOT propagate, warning is logged', () => {
  // Pre-fix: empty `sf.subsystems` fell back to `source.subsystems`,
  // so an SF authored without explicit scope blocked every subsystem
  // the source touched. Two consequences:
  //   (a) topics building unrelated work on overlapping subsystems
  //       were spuriously flagged as blocked
  //   (b) the warning that should have surfaced the missing scope
  //       never fired -- the silent fan-out hid the input defect
  //
  // Post-fix: empty subsystems -> log + skip propagation. The warning
  // becomes the migration nudge for the SF author.
  const warnings: string[] = [];
  const prevSink = setCoherenceWarnSink((m) => warnings.push(m));
  try {
    const source = mkTopic({
      topic: 'topic-with-bad-sf',
      phase: 'build',
      subsystems: ['S05', 'S10'],  // touches multiple subs
      scienceFlags: [mkSf({
        description: 'unscoped SCIENCE-FLAG -- author forgot subsystem field',
        subsystems: [],  // the defect: no explicit scope
        scope: 'active',
      })],
    });
    const consumer = mkTopic({
      topic: 'unrelated-consumer',
      phase: 'build',  // ready-to-build
      subsystems: ['S05'],  // touches one of source's subsystems
    });

    const report = checkCoherence([source, consumer]);

    // No science-flag-propagation conflict should fire -- pre-fix, this
    // would have produced one (blocking the consumer on S05).
    const sfConflicts = report.conflicts.filter(c => c.type === 'science-flag-propagation');
    assert.deepEqual(sfConflicts, [],
      `expected no SF-propagation conflicts; got: ${JSON.stringify(sfConflicts.map(c => c.description))}`);

    // Exactly one warning logged, naming the source topic.
    const sfWarnings = warnings.filter(w => w.includes('SCIENCE-FLAG without explicit subsystems'));
    assert.equal(sfWarnings.length, 1,
      `expected one SF-scope warning; got ${sfWarnings.length}: ${JSON.stringify(warnings)}`);
    assert.match(sfWarnings[0], /topic-with-bad-sf/,
      'warning must name the offending topic');
  } finally {
    setCoherenceWarnSink(prevSink);
  }
});

test('B5: SF with explicit subsystems still propagates (no regression)', () => {
  // Sanity: the fix only changes the empty-subsystems path. SFs with
  // proper scope must continue to fire propagation conflicts.
  const warnings: string[] = [];
  const prevSink = setCoherenceWarnSink((m) => warnings.push(m));
  try {
    const source = mkTopic({
      topic: 'source',
      phase: 'build',
      subsystems: ['S05'],
      scienceFlags: [mkSf({
        description: 'properly-scoped SF',
        subsystems: ['S05'],  // explicit scope
        scope: 'active',
      })],
    });
    const consumer = mkTopic({
      topic: 'consumer',
      phase: 'build',
      subsystems: ['S05'],
    });

    const report = checkCoherence([source, consumer]);

    const sfConflicts = report.conflicts.filter(c => c.type === 'science-flag-propagation');
    assert.equal(sfConflicts.length, 1,
      'a properly-scoped SF affecting a buildable consumer must produce one propagation conflict');
    assert.deepEqual(sfConflicts[0].subsystems, ['S05']);
    assert.deepEqual(sfConflicts[0].topics.sort(), ['consumer', 'source']);

    // No empty-scope warning fires for a properly-scoped SF.
    const sfWarnings = warnings.filter(w => w.includes('SCIENCE-FLAG without explicit subsystems'));
    assert.equal(sfWarnings.length, 0);
  } finally {
    setCoherenceWarnSink(prevSink);
  }
});

test('B5: resolved SF (scope != active) does not warn even with empty subsystems', () => {
  // The unresolvedSFs filter at the top of detectScienceFlagPropagation
  // skips SFs whose scope is not 'active'. An empty-subsystems
  // resolved/deferred/contextual SF should NOT produce a warning --
  // the warning is only for the propagation path.
  const warnings: string[] = [];
  const prevSink = setCoherenceWarnSink((m) => warnings.push(m));
  try {
    const source = mkTopic({
      topic: 'source',
      phase: 'build',
      subsystems: ['S05'],
      scienceFlags: [mkSf({
        description: 'resolved SF -- no longer a propagation hazard',
        subsystems: [],  // empty, but scope is resolved
        scope: 'resolved',
      })],
    });

    checkCoherence([source]);

    const sfWarnings = warnings.filter(w => w.includes('SCIENCE-FLAG without explicit subsystems'));
    assert.equal(sfWarnings.length, 0,
      'resolved/deferred SFs should NOT trigger the empty-subsystems warning');
  } finally {
    setCoherenceWarnSink(prevSink);
  }
});
