/**
 * Tests for buildExecutionLayers + getNodesExcludedFromLayers.
 *
 * The seed regression these guard against is CRITICAL-1 from the
 * 2026-05-04 safety audit: cycle workflows had `release-lock` (a
 * parentless route target) running in Layer 0 alongside `acquire-lock`,
 * destroying the topic lock microseconds after acquisition. Blueprint-
 * cycle was worse -- `architect-gate` and `probe` (parallel-group
 * children defined top-level) also ran unlocked in Layer 0 BEFORE
 * `synthesize`.
 *
 * These tests pin the layer-schedule semantics so any future regression
 * (someone reverts the dag.ts filter, or adds a workflow with an
 * unscheduled-target failure mode) fails noisily.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildExecutionLayers, getNodesExcludedFromLayers } from './dag.js';
import type { Workflow } from './types.js';

function mkWf(nodes: Workflow['nodes']): Workflow {
  return {
    name: 'test',
    version: 1,
    description: '',
    inputs: {},
    nodes,
  };
}

test('parentless route-only target is excluded from layer schedule', () => {
  const wf = mkWf({
    'acquire-lock': { type: 'bash', command: 'true' },
    'work': { type: 'bash', command: 'true', depends_on: ['acquire-lock'] },
    'gate': {
      type: 'gate',
      depends_on: ['work'],
      evaluate: [{ condition: 'true', route: 'release-lock' }],
    },
    'release-lock': { type: 'bash', command: 'true' },
  });

  const excluded = getNodesExcludedFromLayers(wf);
  assert.equal(excluded.has('release-lock'), true,
    'release-lock should be excluded -- it is parentless and a route target');

  const layers = buildExecutionLayers(wf);
  const allScheduled = layers.flatMap(l => l.nodeIds);
  assert.equal(allScheduled.includes('release-lock'), false,
    'release-lock should not appear in any layer');
  assert.deepEqual(layers[0].nodeIds, ['acquire-lock'],
    'Layer 0 should only contain acquire-lock');
});

test('parentless route-target with depends_on stays in normal schedule', () => {
  // A route target that ALSO has depends_on is not "parentless route-only".
  // It runs at its scheduled position; the route-active check filters at
  // shouldExecute time.
  const wf = mkWf({
    'acquire-lock': { type: 'bash', command: 'true' },
    'maybe': { type: 'bash', command: 'true', depends_on: ['acquire-lock'] },
    'gate': {
      type: 'gate',
      depends_on: ['acquire-lock'],
      evaluate: [{ condition: 'true', route: 'maybe' }],
    },
  });

  const excluded = getNodesExcludedFromLayers(wf);
  assert.equal(excluded.has('maybe'), false,
    'maybe should not be excluded -- it has depends_on');
});

test('parallel-group children are excluded from layer schedule', () => {
  const wf = mkWf({
    'group': {
      type: 'parallel',
      nodes: ['child-a', 'child-b'],
      depends_on: ['root'],
    },
    'root': { type: 'bash', command: 'true' },
    // Children defined top-level (the convention in blueprint-cycle).
    'child-a': { type: 'skill', skill: null },
    'child-b': { type: 'skill', skill: null },
    'after': { type: 'bash', command: 'true', depends_on: ['group'] },
  });

  const excluded = getNodesExcludedFromLayers(wf);
  assert.equal(excluded.has('child-a'), true,
    'child-a is in parallel group "group" -- excluded from top-level schedule');
  assert.equal(excluded.has('child-b'), true,
    'child-b is in parallel group "group" -- excluded');

  const layers = buildExecutionLayers(wf);
  const allScheduled = layers.flatMap(l => l.nodeIds);
  assert.equal(allScheduled.includes('child-a'), false,
    'child-a must not appear in any layer (group dispatches it)');
  assert.equal(allScheduled.includes('child-b'), false);
  assert.equal(allScheduled.includes('group'), true,
    'group itself is scheduled; it dispatches its children at runtime');
});

test('cycle workflow Layer 0 contains only acquire-lock (regression guard for CRITICAL-1)', () => {
  // Models the structure of every shipped cycle workflow:
  //   acquire-lock (parentless, entry)
  //   release-lock (parentless, route target from abort approvals)
  //   complete    (depends_on the last real step, releases on success)
  // This is exactly the pre-fix shape in build-cycle/blueprint-cycle/etc.
  const wf = mkWf({
    'acquire-lock': { type: 'bash', command: 'true' },
    'work': { type: 'skill', skill: null, depends_on: ['acquire-lock'] },
    'verdict': {
      type: 'gate',
      depends_on: ['work'],
      evaluate: [
        { condition: 'PASS', route: 'complete' },
        { condition: 'default', route: 'release-lock' },
      ],
    },
    'complete': { type: 'bash', command: 'true', depends_on: ['verdict'] },
    'release-lock': { type: 'bash', command: 'true' },
  });

  const layers = buildExecutionLayers(wf);
  assert.deepEqual(layers[0].nodeIds, ['acquire-lock'],
    `Layer 0 must contain ONLY acquire-lock. Got: ${JSON.stringify(layers[0].nodeIds)}. ` +
    `If release-lock is in Layer 0 again, the lock model is broken (CRITICAL-1 regression).`);
});

test('downstream of an excluded node still gets scheduled correctly', () => {
  // If `gate` depends on a node that's excluded (parallel-group child),
  // the dependency is dropped (the group is the actual prerequisite).
  // Make sure Kahn's still terminates -- no infinite layer construction.
  const wf = mkWf({
    'group': {
      type: 'parallel',
      nodes: ['child'],
    },
    'child': { type: 'bash', command: 'true' },
    'after-child': { type: 'bash', command: 'true', depends_on: ['child'] },
  });

  // When `after-child` depends on the excluded `child`, the dependency
  // is dropped from inDegree. `after-child` therefore lands in Layer 0
  // alongside `group`. This is the correct semantic: the group's
  // executor populates ctx.nodes['child'] before `after-child` could
  // template-reference it (in practice, depending on a parallel-group
  // child by name is non-canonical and the workflow author should
  // depend on the group instead).
  const layers = buildExecutionLayers(wf);
  const allScheduled = new Set(layers.flatMap(l => l.nodeIds));
  assert.equal(allScheduled.has('group'), true);
  assert.equal(allScheduled.has('after-child'), true);
  assert.equal(allScheduled.has('child'), false);
});
