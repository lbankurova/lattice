/**
 * Test for revision_check enforcement (engine.ts writeCheckpoint).
 *
 * Guards against CRITICAL-6 from the 2026-05-04 audit: pre-fix the engine
 * incremented `revision` but never compared it; two parallel writers
 * silently overwrote each other. CLAUDE.md / WORKFLOW-INTERNALS / ENFORCEMENT
 * documented "STOP on revision mismatch" but no code enforced it.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { writeCheckpoint } from './engine.js';
import type { Workflow, WorkflowRun, NodeResult } from './types.js';

function mkWf(): Workflow {
  return {
    name: 'test',
    version: 1,
    description: '',
    inputs: { topic: { type: 'string', required: true } },
    state: {
      file: '.lattice/cycle-state/{{inputs.topic}}.yaml',
      revision_check: true,
    },
    nodes: {},
  };
}

function mkResult(): NodeResult {
  return {
    nodeId: 'n1',
    status: 'completed',
    output: '',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

function mkRun(initialRevision = 0): WorkflowRun {
  return {
    workflowName: 'test',
    inputs: { topic: 'foo' },
    startedAt: new Date().toISOString(),
    status: 'running',
    nodeResults: {},
    activeRoutes: new Set(),
    totalCost: { totalUSD: 0, totalInputTokens: 0, totalOutputTokens: 0, byNode: {} },
    expectedRevision: initialRevision,
  };
}

test('writeCheckpoint succeeds when revision matches expected', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'lattice-rev-test-'));
  try {
    const wf = mkWf();
    const run = mkRun(0);
    writeCheckpoint(wf, { topic: 'foo' }, cwd, 'step1', undefined, mkResult(), run);

    const stateFile = join(cwd, '.lattice', 'cycle-state', 'foo.yaml');
    const data = yaml.load(readFileSync(stateFile, 'utf-8')) as Record<string, unknown>;
    assert.equal(data['revision'], 1, 'revision should be incremented to 1');
    assert.equal(run.expectedRevision, 1, 'run.expectedRevision should track the new value');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('writeCheckpoint throws on revision mismatch (concurrent writer)', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'lattice-rev-test-'));
  try {
    const wf = mkWf();
    const run = mkRun(0);

    // Write once -- revision 0 -> 1, run.expectedRevision -> 1.
    writeCheckpoint(wf, { topic: 'foo' }, cwd, 'step1', undefined, mkResult(), run);
    assert.equal(run.expectedRevision, 1);

    // Simulate a concurrent writer landing AFTER our write but BEFORE
    // our next call. Manually bump the file's revision to 99.
    const stateFile = join(cwd, '.lattice', 'cycle-state', 'foo.yaml');
    const current = yaml.load(readFileSync(stateFile, 'utf-8')) as Record<string, unknown>;
    current['revision'] = 99;
    writeFileSync(stateFile, yaml.dump(current), 'utf-8');

    // Our next write should detect the mismatch and throw.
    assert.throws(
      () => writeCheckpoint(wf, { topic: 'foo' }, cwd, 'step2', undefined, mkResult(), run),
      /Revision mismatch/,
      'writeCheckpoint must throw when file revision != run.expectedRevision',
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('writeCheckpoint with revision_check=false does NOT throw on mismatch', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'lattice-rev-test-'));
  try {
    const wf = mkWf();
    wf.state!.revision_check = false; // disable the check
    const run = mkRun(0);

    writeCheckpoint(wf, { topic: 'foo' }, cwd, 'step1', undefined, mkResult(), run);

    const stateFile = join(cwd, '.lattice', 'cycle-state', 'foo.yaml');
    const current = yaml.load(readFileSync(stateFile, 'utf-8')) as Record<string, unknown>;
    current['revision'] = 99;
    writeFileSync(stateFile, yaml.dump(current), 'utf-8');

    // Should silently overwrite (legacy semantics) when revision_check is off.
    assert.doesNotThrow(
      () => writeCheckpoint(wf, { topic: 'foo' }, cwd, 'step2', undefined, mkResult(), run),
      'with revision_check disabled, writeCheckpoint should not throw',
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
