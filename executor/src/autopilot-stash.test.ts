/**
 * Tests for stashWorkflowOutput foreign-state guard (autopilot.ts).
 *
 * The seed bug from the 2026-05-04 incident: pre-fix `stashIfDirty` ran
 * `git stash push -u` over the entire dirty tree, sweeping a parallel
 * agent's ~2300 LOC into a stash labeled with autopilot's failing topic.
 * The fix snapshots dirty paths BEFORE each workflow item, then path-
 * scopes the post-workflow stash to (post - pre). Foreign paths are
 * never touched.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureDirtyPaths, stashWorkflowOutput } from './autopilot.js';

function mkRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-stash-test-'));
  const sh = (cmd: string) => execSync(cmd, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  sh('git init --quiet -b master');
  sh('git config user.email "test@test"');
  sh('git config user.name "test"');
  writeFileSync(join(dir, 'tracked.txt'), 'initial\n');
  sh('git add tracked.txt');
  sh('git commit --quiet -m initial');
  return dir;
}

test('captureDirtyPaths returns paths in `git status --porcelain`', () => {
  const cwd = mkRepo();
  try {
    writeFileSync(join(cwd, 'untracked.txt'), 'foo\n');
    writeFileSync(join(cwd, 'tracked.txt'), 'modified\n');
    const paths = captureDirtyPaths(cwd);
    assert.equal(paths.has('untracked.txt'), true);
    assert.equal(paths.has('tracked.txt'), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('stashWorkflowOutput leaves foreign-state paths untouched', () => {
  const cwd = mkRepo();
  try {
    // Foreign state: parallel agent's edits before autopilot's workflow
    // even started.
    writeFileSync(join(cwd, 'parallel-untracked.txt'), 'do not stash me\n');
    writeFileSync(join(cwd, 'tracked.txt'), 'parallel agent modified this\n');

    // Snapshot at pre-workflow time:
    const excludePaths = captureDirtyPaths(cwd);
    assert.equal(excludePaths.size, 2,
      'pre-workflow snapshot should capture both foreign paths');

    // Workflow runs and produces its own output:
    writeFileSync(join(cwd, 'workflow-output.txt'), 'I am workflow output\n');

    // stashWorkflowOutput should stash ONLY workflow-output.txt,
    // NOT the foreign paths.
    const result = stashWorkflowOutput(cwd, excludePaths, 'completed', 'topic', 'foo');
    assert.equal(typeof result, 'string',
      `expected stash label, got: ${JSON.stringify(result)}`);
    assert.match(result as string, /^autopilot-completed-topic-foo-/);

    // Foreign paths should still be on disk and dirty.
    assert.equal(existsSync(join(cwd, 'parallel-untracked.txt')), true,
      'parallel-untracked.txt must remain on disk');
    const dirtyAfter = captureDirtyPaths(cwd);
    assert.equal(dirtyAfter.has('parallel-untracked.txt'), true,
      'parallel-untracked.txt must still be dirty');
    assert.equal(dirtyAfter.has('tracked.txt'), true,
      'tracked.txt must still be modified');
    assert.equal(dirtyAfter.has('workflow-output.txt'), false,
      'workflow-output.txt must be in the stash, not the working tree');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('stashWorkflowOutput returns "foreign-only" when only foreign state is dirty', () => {
  const cwd = mkRepo();
  try {
    writeFileSync(join(cwd, 'parallel.txt'), 'foreign\n');
    const excludePaths = captureDirtyPaths(cwd);

    // Workflow ran but produced nothing on disk (e.g., failed at
    // acquire-lock, never reached an edit).
    const result = stashWorkflowOutput(cwd, excludePaths, 'failed', 'topic', 'foo');
    assert.equal(result, 'foreign-only',
      'when no workflow-owned paths appeared, must return "foreign-only" sentinel');

    // Foreign state untouched.
    assert.equal(existsSync(join(cwd, 'parallel.txt')), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('stashWorkflowOutput returns "no-changes" on a clean tree', () => {
  const cwd = mkRepo();
  try {
    const result = stashWorkflowOutput(cwd, new Set(), 'completed', 'topic', 'foo');
    assert.equal(result, 'no-changes');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
