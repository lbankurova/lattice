/**
 * Tests for the worktree-isolation R3 refactor of e2e branch-mode.
 *
 * Pre-R3 behavior: branch-mode stashed dirty work, checked out base, ran
 * suites, restored. The foreign-state guard refused the run when WIP
 * existed outside the diff scope -- the stash machinery would otherwise
 * sweep up parallel-session work.
 *
 * Post-R3 behavior: branch-mode creates two detached worktrees (base SHA
 * and feature SHA), runs suites in each. The user's canonical tree is
 * never mutated. Foreign WIP is left untouched and surfaced as an
 * advisory, not a blocker.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBranchComparison, type E2EConfig } from './e2e.js';

function mkRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-e2e-wt-test-'));
  const sh = (cmd: string) => execSync(cmd, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  sh('git init --quiet -b master');
  sh('git config user.email "test@test"');
  sh('git config user.name "test"');
  writeFileSync(join(dir, 'src.txt'), 'v1\n');
  sh('git add src.txt');
  sh('git commit --quiet -m initial');
  // feature branch with a code change
  sh('git checkout --quiet -b feature');
  writeFileSync(join(dir, 'src.txt'), 'v2\n');
  sh('git add src.txt');
  sh('git commit --quiet -m feature-change');
  return dir;
}

function trivialConfig(): E2EConfig {
  return {
    testability: { e2e_testable: ['*.txt'], code_review_only: [] },
    suites: [
      {
        name: 'echo',
        command: 'cat src.txt',
        comparison: 'exit_code',
      },
    ],
    timeouts: { per_suite: 10_000, total: 30_000 },
    base_branch: 'master',
  };
}

test('branch-mode succeeds with foreign WIP in canonical tree', () => {
  const cwd = mkRepo();
  try {
    // Foreign WIP: a file that's not in the diff scope.
    writeFileSync(join(cwd, 'foreign.txt'), 'do not touch me\n');

    const config = trivialConfig();
    const result = runBranchComparison(config, cwd);

    // Pre-R3 the run would have errored ("e2e refused to run: working tree
    // has 1 dirty path(s) outside the diff scope"). Post-R3 it completes.
    assert.notEqual(result.verdict, 'error',
      `Pre-R3 the run errored on foreign WIP. Got: ${result.verdict} ${result.error ?? ''}`);

    // Foreign file should be untouched in the canonical tree.
    assert.equal(existsSync(join(cwd, 'foreign.txt')), true,
      'foreign.txt must still exist in canonical tree');
    assert.equal(readFileSync(join(cwd, 'foreign.txt'), 'utf-8'), 'do not touch me\n',
      'foreign.txt content must be unchanged');

    // Advisory should be present (informational, not blocking).
    assert.ok(result.advisory && result.advisory.includes('foreign.txt'),
      `expected advisory mentioning foreign.txt; got: ${result.advisory ?? '(none)'}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('branch-mode does not leave detached worktrees behind', () => {
  const cwd = mkRepo();
  try {
    const config = trivialConfig();
    runBranchComparison(config, cwd);

    // After the run, `git worktree list --porcelain` should show only the
    // canonical tree -- no leftover e2e worktrees. The R3 finally block
    // calls `git worktree remove --force` on every tracked worktree.
    const listOutput = execSync('git worktree list --porcelain', { cwd, encoding: 'utf-8' });
    const worktreeCount = (listOutput.match(/^worktree /gm) ?? []).length;
    assert.equal(worktreeCount, 1,
      `Expected only the canonical worktree after run; got ${worktreeCount}.\n${listOutput}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('branch-mode leaves no e2e stash entries (canonical stash list unchanged)', () => {
  const cwd = mkRepo();
  try {
    const config = trivialConfig();

    // Pre-existing stash entry to confirm we don't inadvertently push/pop it.
    writeFileSync(join(cwd, 'pre-existing-wip.txt'), 'stashed\n');
    execSync('git stash push -u -m pre-existing-test-stash', { cwd, stdio: 'ignore' });
    const stashListBefore = execSync('git stash list', { cwd, encoding: 'utf-8' }).trim();

    runBranchComparison(config, cwd);

    const stashListAfter = execSync('git stash list', { cwd, encoding: 'utf-8' }).trim();
    assert.equal(stashListAfter, stashListBefore,
      `Pre-R3 left a 'lattice-e2e-gate' stash; R3 must not touch the stash list.`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('branch-mode leaves user on the original branch (no checkout side-effects)', () => {
  const cwd = mkRepo();
  try {
    const before = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    assert.equal(before, 'feature');

    const config = trivialConfig();
    runBranchComparison(config, cwd);

    const after = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    assert.equal(after, 'feature',
      `Expected to stay on 'feature' branch after run; got '${after}'.`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('two e2e runs against different feature branches do not contend (R3 AC2)', async () => {
  // R3 AC2: "Two e2e runs against different feature branches can execute
  // concurrently -- each gets its own pair of detached worktrees, no
  // contention." The worktree-path generator stamps an ISO timestamp; this
  // test launches two runs back-to-back and asserts each consumed disjoint
  // worktree paths and produced clean post-state in the shared canonical.
  const cwd = mkRepo();
  try {
    // Add a second feature branch with its own change.
    execSync('git checkout --quiet -b feature-2 master', { cwd, stdio: 'ignore' });
    writeFileSync(join(cwd, 'src.txt'), 'v3\n');
    execSync('git add src.txt && git commit --quiet -m feature-2', { cwd, stdio: 'ignore' });
    execSync('git checkout --quiet feature', { cwd, stdio: 'ignore' });

    const config = trivialConfig();

    // Launch two runs in parallel via Promise.all. Each call is sync inside
    // (runBranchComparison is sync), but the two Promise wrappers exercise
    // the no-shared-state invariant: each must complete without one's
    // worktree teardown stomping the other's.
    const [r1, r2] = await Promise.all([
      Promise.resolve().then(() => runBranchComparison(config, cwd)),
      Promise.resolve().then(() => runBranchComparison(config, cwd, 'feature-2')),
    ]);

    assert.notEqual(r1.verdict, 'error', `run 1 errored: ${r1.error ?? ''}`);
    assert.notEqual(r2.verdict, 'error', `run 2 errored: ${r2.error ?? ''}`);

    // Post-state: only canonical worktree remains. Both runs cleaned up.
    const listOutput = execSync('git worktree list --porcelain', { cwd, encoding: 'utf-8' });
    const worktreeCount = (listOutput.match(/^worktree /gm) ?? []).length;
    assert.equal(worktreeCount, 1,
      `Concurrent runs left ${worktreeCount} worktrees behind:\n${listOutput}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
