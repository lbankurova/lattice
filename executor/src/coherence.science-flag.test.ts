/**
 * Tests for `detectScienceFlagPropagation` in coherence.ts (currently
 * lines 786-827 in the on-disk file; the post-B5 fix lives at the
 * `affectedSubs` resolution at the top of the per-flag inner loop).
 *
 * Pre-B5 behavior (current at the lattice-stream-e branch point):
 *   const affectedSubs = sf.subsystems.length > 0
 *     ? sf.subsystems
 *     : source.subsystems;  // <— BUG: empty SF subsystems propagate to ALL.
 *
 * Post-B5 behavior (Stream B item B5 will land):
 *   const affectedSubs = sf.subsystems.length > 0
 *     ? sf.subsystems
 *     : (warn('SF with empty subsystems on topic ' + source.topic), []);
 *
 * The empty-subsystem case must NOT propagate. The current fallback to
 * `source.subsystems` means a single ill-typed SF blocks every downstream
 * topic that touches any subsystem the source happens to mention — a
 * fan-out false-positive. B5 forces SF authors to declare an explicit
 * scope; the warning surfaces the legacy YAMLs that need backfilling.
 *
 * CROSS-STREAM (per spec E3): authored on stream-e in parallel with B5
 * on stream-b. Once B5 merged into the umbrella, this follow-up commit
 * removed the test.skip wrappers; the assertions now run live against
 * the post-B5 implementation.
 *
 * Authoring on stream-e ensured the contract was captured at the same
 * moment the gap was identified, avoiding the failure mode where a fix
 * lands without a regression test.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkCoherence, setCoherenceWarnSink } from './coherence.js';
import type {
  TopicState,
  ScienceFlag,
  CrossTopicInteraction,
  SubsystemInteraction,
  BreaksEntry,
} from './coherence.js';

// ── Test helpers ────────────────────────────────────────────

function mkTopic(overrides: Partial<TopicState>): TopicState {
  const base: TopicState = {
    topic: 'topic-x',
    phase: 'research',
    currentStep: '',
    startedAt: new Date().toISOString(),
    lifecycleState: 'active',
    pauseReason: '',
    hasLock: false,
    lockHolder: null,
    subsystems: [],
    scienceFlags: [],
    breaks: [] as BreaksEntry[],
    propagates: [],
    prerequisites: [],
    crossTopicInteractions: [] as CrossTopicInteraction[],
    keyDecisions: [],
    probeResult: '',
    lastCheckpoint: new Date().toISOString(),
    stateFile: '/tmp/test.yaml',
    docRefs: [],
    subsystemInteractions: [] as SubsystemInteraction[],
  };
  return { ...base, ...overrides };
}

function mkScienceFlag(overrides: Partial<ScienceFlag>): ScienceFlag {
  return {
    description: 'unspecified flag',
    subsystems: [],
    resolved: false,
    scope: 'active',
    ...overrides,
  };
}

// ── E3 tests (active post-B5 merge) ─────────────────────────

test(
  'E3 (post-B5): SF with empty subsystems does NOT propagate to consumers',
  () => {
    // Setup: source topic has an active SF with NO declared subsystems,
    // and `subsystems: ['S01', 'S02']` at the topic level. A downstream
    // topic in `blueprint-complete` consumes S01.
    //
    // Pre-B5: the SF falls back to source.subsystems = [S01, S02], which
    //   matches the consumer's S01 -> a science-flag-propagation conflict
    //   is emitted. Consumer is blocked. (FALSE POSITIVE.)
    //
    // Post-B5: the SF's empty subsystems list causes affectedSubs=[] and
    //   the inner loop runs zero times. No conflict emitted. The
    //   consumer is free to advance.
    const source = mkTopic({
      topic: 'source-topic',
      phase: 'research',
      subsystems: ['S01', 'S02'],
      scienceFlags: [
        mkScienceFlag({
          description: 'ill-typed SF, scope unstated',
          subsystems: [], // <— the bug payload
          scope: 'active',
        }),
      ],
    });
    const consumer = mkTopic({
      topic: 'consumer-topic',
      phase: 'blueprint-complete',
      subsystems: ['S01'],
    });

    const report = checkCoherence([source, consumer]);
    const sfConflicts = report.conflicts.filter(
      c => c.type === 'science-flag-propagation',
    );
    assert.equal(
      sfConflicts.length,
      0,
      'empty-subsystem SF must NOT propagate post-B5; ' +
        `got ${sfConflicts.length} false-positive(s): ` +
        JSON.stringify(sfConflicts.map(c => c.description)),
    );
    // Consumer should be safe to advance.
    assert.ok(
      report.safe.includes('consumer-topic'),
      `consumer-topic should be in safe[]; got safe=${JSON.stringify(report.safe)}, ` +
        `blocked=${JSON.stringify(report.blocked)}`,
    );
  },
);

test(
  'E3 (post-B5): SF with empty subsystems emits a warning to surface legacy YAMLs',
  () => {
    // The B5 fix logs a warning when an SF has empty subsystems so the
    // operator can backfill the legacy YAML. The warning must:
    //   (a) name the source topic,
    //   (b) name the SF (id or description prefix),
    //   (c) NOT be silent.
    //
    // B5 introduced setCoherenceWarnSink (mirrors loader.ts setWarnSink).
    // The default sink writes to stderr; tests intercept via a recorder.
    const captured: string[] = [];
    const prevSink = setCoherenceWarnSink((msg) => captured.push(msg));
    try {
      const source = mkTopic({
        topic: 'src',
        phase: 'research',
        subsystems: ['S01'],
        scienceFlags: [
          mkScienceFlag({
            description: 'no-subsystems SF',
            subsystems: [],
            scope: 'active',
          }),
        ],
      });
      const consumer = mkTopic({
        topic: 'dst',
        phase: 'blueprint-complete',
        subsystems: ['S01'],
      });
      checkCoherence([source, consumer]);
      // Loose match — B5 may choose stderr / setWarnSink / structured
      // logger. Adjust matcher when B5 ships.
      assert.ok(
        captured.length > 0,
        'expected at least one warning when an SF has empty subsystems',
      );
      assert.ok(
        captured.some(w => /empty.*subsystems/i.test(w) || /no.*subsystems/i.test(w)),
        `warning should mention empty/no subsystems; got: ${JSON.stringify(captured)}`,
      );
    } finally {
      setCoherenceWarnSink(prevSink);
    }
  },
);

test(
  'E3 (post-B5): SF with explicit subsystems still propagates correctly',
  () => {
    // Sanity: B5 only changes the empty-list path. SFs that name their
    // subsystems must still propagate to the right consumers.
    const source = mkTopic({
      topic: 'source-topic',
      phase: 'research',
      subsystems: ['S01', 'S02'],
      scienceFlags: [
        mkScienceFlag({
          description: 'real SF, properly scoped',
          subsystems: ['S01'], // explicit scope
          scope: 'active',
        }),
      ],
    });
    const consumer = mkTopic({
      topic: 'consumer-topic',
      phase: 'blueprint-complete',
      subsystems: ['S01'],
    });
    const noiseConsumer = mkTopic({
      topic: 'unrelated',
      phase: 'blueprint-complete',
      subsystems: ['S99'],
    });

    const report = checkCoherence([source, consumer, noiseConsumer]);
    const sfConflicts = report.conflicts.filter(
      c => c.type === 'science-flag-propagation',
    );
    assert.equal(
      sfConflicts.length,
      1,
      'explicit-subsystem SF should propagate to exactly the matching consumer',
    );
    assert.ok(sfConflicts[0].topics.includes('consumer-topic'));
    assert.ok(!sfConflicts[0].topics.includes('unrelated'));
  },
);
