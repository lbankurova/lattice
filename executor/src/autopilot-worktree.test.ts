/**
 * Tests for the worktree-isolation R1 session-spawn helpers.
 *
 * R1's contract: two autopilot batches running concurrently against the
 * same repo must NOT conflate — each batch's commits land on its own
 * branch; the canonical tree's HEAD never sees concurrent staging from
 * different batches.
 *
 * Pre-R1: both batches share the canonical repo's index. A `git add` from
 * batch B can be swept up into batch A's commit (the 4 documented
 * incidents: 1370c103, 521f1d16, a47ee865, abdb31c9).
 *
 * Post-R1: each batch operates in its own git worktree -> isolated index.
 * Conflation cannot occur. This test exercises the underlying helper
 * scripts (lattice-session-start.sh, lattice-session-end.sh) that
 * autopilot.ts invokes when LATTICE_AUTOPILOT_WORKTREE=1.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM equivalent of __dirname (executor is built with type: "module").
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LATTICE_ROOT = resolve(__dirname, '..', '..');
const SESSION_START = resolve(LATTICE_ROOT, 'scripts/lattice-session-start.sh');
const SESSION_END = resolve(LATTICE_ROOT, 'scripts/lattice-session-end.sh');

function mkRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-r1-test-'));
  const sh = (cmd: string) => execSync(cmd, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  sh('git init --quiet -b master');
  sh('git config user.email "test@test"');
  sh('git config user.name "test"');
  writeFileSync(join(dir, 'README.md'), 'init\n');
  sh('git add README.md');
  sh('git commit --quiet -m initial');
  return dir;
}

function runHelper(script: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('bash', [script, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
  });
  return {
    status: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function extractWorktreePath(stdout: string): string | null {
  const m = stdout.match(/Path:\s+([^\r\n]+)/);
  return m ? m[1].trim() : null;
}

test('lattice-session-start.sh creates an isolated worktree', () => {
  if (!existsSync(SESSION_START)) {
    // CI-friendly skip when the helper is not deployed (e.g., test runs
    // before the synthesis lands in the source tree).
    console.log('SKIP: lattice-session-start.sh not present');
    return;
  }
  const cwd = mkRepo();
  let worktreePath: string | null = null;
  try {
    const r = runHelper(SESSION_START, ['test-batch-a', '--skip-deps'], cwd);
    assert.equal(r.status, 0,
      `lattice-session-start.sh failed (exit ${r.status}):\n${r.stderr}\n${r.stdout}`);
    worktreePath = extractWorktreePath(r.stdout);
    assert.ok(worktreePath, `Expected worktree path in stdout; got:\n${r.stdout}`);
    assert.ok(existsSync(worktreePath!), `Worktree path does not exist: ${worktreePath}`);

    // Worktree must contain a fresh checkout (README.md from initial commit).
    assert.ok(existsSync(join(worktreePath!, 'README.md')), 'worktree missing README.md');

    // Canonical tree must NOT have a session/* branch checked out -- HEAD
    // should still be master.
    const head = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    assert.equal(head, 'master', `canonical HEAD changed to ${head}; should still be master`);
  } finally {
    if (worktreePath && existsSync(worktreePath)) {
      // Clean up via the end helper if it exists; otherwise force-remove.
      if (existsSync(SESSION_END)) {
        runHelper(SESSION_END, ['test-batch-a', '--discard'], cwd);
      } else {
        try { execSync(`git worktree remove --force "${worktreePath}"`, { cwd }); } catch { /* */ }
      }
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('two concurrent batches do NOT conflate (each gets own branch)', () => {
  if (!existsSync(SESSION_START) || !existsSync(SESSION_END)) {
    console.log('SKIP: R1 helpers not present');
    return;
  }
  const cwd = mkRepo();
  const aPath: { v: string | null } = { v: null };
  const bPath: { v: string | null } = { v: null };
  try {
    // Spawn both worktrees (sequentially in test, but each is its own
    // worktree so the contract is identical to concurrent invocation --
    // git's worktree-add semantics are atomic per-branch).
    const ra = runHelper(SESSION_START, ['batch-a', '--skip-deps'], cwd);
    assert.equal(ra.status, 0, `batch-a start failed:\n${ra.stderr}`);
    aPath.v = extractWorktreePath(ra.stdout);
    assert.ok(aPath.v);

    const rb = runHelper(SESSION_START, ['batch-b', '--skip-deps'], cwd);
    assert.equal(rb.status, 0, `batch-b start failed:\n${rb.stderr}`);
    bPath.v = extractWorktreePath(rb.stdout);
    assert.ok(bPath.v);

    // Each batch makes a commit in its own worktree.
    writeFileSync(join(aPath.v!, 'a-work.txt'), 'work from batch a\n');
    execSync('git add a-work.txt && git commit --quiet -m "batch-a work"',
      { cwd: aPath.v!, stdio: ['ignore', 'pipe', 'pipe'] });

    writeFileSync(join(bPath.v!, 'b-work.txt'), 'work from batch b\n');
    execSync('git add b-work.txt && git commit --quiet -m "batch-b work"',
      { cwd: bPath.v!, stdio: ['ignore', 'pipe', 'pipe'] });

    // Each commit must be on its own branch -- not on master, not on the
    // other batch's branch.
    const aCommit = execSync('git log -1 --format=%H', { cwd: aPath.v!, encoding: 'utf-8' }).trim();
    const bCommit = execSync('git log -1 --format=%H', { cwd: bPath.v!, encoding: 'utf-8' }).trim();
    const masterCommits = execSync('git log master --oneline', { cwd, encoding: 'utf-8' });

    assert.notEqual(aCommit, bCommit, 'batches produced identical commits -- conflation');
    assert.ok(!masterCommits.includes(aCommit.slice(0, 7)),
      `batch-a commit landed on master:\n${masterCommits}`);
    assert.ok(!masterCommits.includes(bCommit.slice(0, 7)),
      `batch-b commit landed on master:\n${masterCommits}`);

    // Master has only the initial commit.
    const masterCount = execSync('git rev-list --count master', { cwd, encoding: 'utf-8' }).trim();
    assert.equal(masterCount, '1', `master should have 1 commit; got ${masterCount}`);
  } finally {
    if (existsSync(SESSION_END)) {
      runHelper(SESSION_END, ['batch-a', '--discard'], cwd);
      runHelper(SESSION_END, ['batch-b', '--discard'], cwd);
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('lattice-session-end.sh --merge-back fast-forwards into base', () => {
  if (!existsSync(SESSION_START) || !existsSync(SESSION_END)) {
    console.log('SKIP: R1 helpers not present');
    return;
  }
  const cwd = mkRepo();
  let wt: string | null = null;
  try {
    const r = runHelper(SESSION_START, ['ff-test', '--skip-deps'], cwd);
    assert.equal(r.status, 0, `start failed:\n${r.stderr}`);
    wt = extractWorktreePath(r.stdout);
    assert.ok(wt);

    writeFileSync(join(wt!, 'feature.txt'), 'shipped\n');
    execSync('git add feature.txt && git commit --quiet -m "feature work"',
      { cwd: wt!, stdio: ['ignore', 'pipe', 'pipe'] });

    const end = runHelper(SESSION_END, ['ff-test', '--merge-back'], cwd);
    assert.equal(end.status, 0, `end failed:\n${end.stderr}\n${end.stdout}`);

    // Worktree directory removed.
    assert.equal(existsSync(wt!), false, `worktree ${wt} not removed`);

    // Master now contains feature.txt at HEAD.
    const masterFile = execSync('git show master:feature.txt', { cwd, encoding: 'utf-8' });
    assert.ok(masterFile.includes('shipped'), 'feature.txt did not merge into master');

    // Master commit count is now 2 (initial + feature).
    const count = execSync('git rev-list --count master', { cwd, encoding: 'utf-8' }).trim();
    assert.equal(count, '2', `master commit count after FF should be 2; got ${count}`);
    wt = null; // already removed by --merge-back
  } finally {
    if (wt && existsSync(wt)) {
      runHelper(SESSION_END, ['ff-test', '--discard'], cwd);
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ── Integration phase: --rebase path (ENH-17a) ──
//
// Builds a session branch that is BEHIND base (the normal case once master
// advances during the run). Bare --merge-back strands it (FF-only); --rebase
// rebases onto base, optionally re-gates, and lands it.

/** Start a session, commit `feature.txt` on the branch, then advance master on
 *  a DIFFERENT file so the branch is 1-ahead / 1-behind (clean rebase). */
function setupBehindBranch(topic: string, cwd: string): string {
  const r = runHelper(SESSION_START, [topic, '--skip-deps'], cwd);
  assert.equal(r.status, 0, `start failed:\n${r.stderr}`);
  const wt = extractWorktreePath(r.stdout);
  assert.ok(wt, 'worktree path not parseable');
  // Branch work.
  writeFileSync(join(wt!, 'feature.txt'), 'shipped\n');
  execSync('git add feature.txt && git commit --quiet -m "feature work"',
    { cwd: wt!, stdio: ['ignore', 'pipe', 'pipe'] });
  // Base advances on an unrelated file -> branch is now behind.
  writeFileSync(join(cwd, 'other.txt'), 'base moved\n');
  execSync('git add other.txt && git commit --quiet -m "base advance"',
    { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return wt!;
}

test('lattice-session-end.sh --merge-back (no --rebase) strands a behind-branch (exit 2)', () => {
  if (!existsSync(SESSION_START) || !existsSync(SESSION_END)) {
    console.log('SKIP: R1 helpers not present');
    return;
  }
  const cwd = mkRepo();
  let wt: string | null = null;
  try {
    wt = setupBehindBranch('behind-noreb', cwd);
    const end = runHelper(SESSION_END, ['behind-noreb', '--merge-back'], cwd);
    assert.equal(end.status, 2, `expected exit 2 (non-FF), got ${end.status}:\n${end.stdout}`);
    // Branch + worktree left intact for recovery.
    assert.equal(existsSync(wt!), true, 'worktree should be left intact on non-FF abort');
    // Master did NOT gain feature.txt.
    const has = spawnSync('git', ['show', 'master:feature.txt'], { cwd, encoding: 'utf-8' });
    assert.notEqual(has.status, 0, 'feature.txt must NOT be on master after a stranded merge-back');
  } finally {
    if (wt && existsSync(wt)) runHelper(SESSION_END, ['behind-noreb', '--discard'], cwd);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('lattice-session-end.sh --merge-back --rebase lands a behind-branch', () => {
  if (!existsSync(SESSION_START) || !existsSync(SESSION_END)) {
    console.log('SKIP: R1 helpers not present');
    return;
  }
  const cwd = mkRepo();
  let wt: string | null = null;
  try {
    wt = setupBehindBranch('behind-reb', cwd);
    const end = runHelper(SESSION_END, ['behind-reb', '--merge-back', '--rebase'], cwd);
    assert.equal(end.status, 0, `rebase-land failed:\n${end.stderr}\n${end.stdout}`);
    assert.equal(existsSync(wt!), false, 'worktree should be removed after a successful rebase-land');
    // Master now has BOTH the base advance and the rebased feature.
    assert.ok(execSync('git show master:feature.txt', { cwd, encoding: 'utf-8' }).includes('shipped'),
      'feature.txt did not land after rebase');
    assert.ok(execSync('git show master:other.txt', { cwd, encoding: 'utf-8' }).includes('base moved'),
      'base advance lost');
    // initial + other + feature = 3 (linear history via rebase, no merge commit).
    const count = execSync('git rev-list --count master', { cwd, encoding: 'utf-8' }).trim();
    assert.equal(count, '3', `master commit count after rebase-land should be 3; got ${count}`);
    wt = null;
  } finally {
    if (wt && existsSync(wt)) runHelper(SESSION_END, ['behind-reb', '--discard'], cwd);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('lattice-session-end.sh --rebase --gate-cmd refuses to land on a red re-gate (exit 2)', () => {
  if (!existsSync(SESSION_START) || !existsSync(SESSION_END)) {
    console.log('SKIP: R1 helpers not present');
    return;
  }
  const cwd = mkRepo();
  let wt: string | null = null;
  try {
    wt = setupBehindBranch('behind-redgate', cwd);
    // Re-gate fails -> clean rebase but must NOT merge.
    const end = runHelper(SESSION_END, ['behind-redgate', '--merge-back', '--rebase', '--gate-cmd', 'exit 1'], cwd);
    assert.equal(end.status, 2, `expected exit 2 on red gate, got ${end.status}:\n${end.stdout}`);
    assert.equal(existsSync(wt!), true, 'worktree must be left intact on red re-gate');
    const has = spawnSync('git', ['show', 'master:feature.txt'], { cwd, encoding: 'utf-8' });
    assert.notEqual(has.status, 0, 'feature.txt must NOT land when the re-gate is red');
  } finally {
    if (wt && existsSync(wt)) runHelper(SESSION_END, ['behind-redgate', '--discard'], cwd);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('lattice-session-end.sh --rebase --gate-cmd lands when the re-gate passes', () => {
  if (!existsSync(SESSION_START) || !existsSync(SESSION_END)) {
    console.log('SKIP: R1 helpers not present');
    return;
  }
  const cwd = mkRepo();
  let wt: string | null = null;
  try {
    wt = setupBehindBranch('behind-greengate', cwd);
    const end = runHelper(SESSION_END, ['behind-greengate', '--merge-back', '--rebase', '--gate-cmd', 'test -f feature.txt'], cwd);
    assert.equal(end.status, 0, `green-gate land failed:\n${end.stderr}\n${end.stdout}`);
    assert.equal(existsSync(wt!), false, 'worktree should be removed after a green-gate land');
    assert.ok(execSync('git show master:feature.txt', { cwd, encoding: 'utf-8' }).includes('shipped'),
      'feature.txt did not land after green re-gate');
    wt = null;
  } finally {
    if (wt && existsSync(wt)) runHelper(SESSION_END, ['behind-greengate', '--discard'], cwd);
    rmSync(cwd, { recursive: true, force: true });
  }
});
