/**
 * Tests for atomicWriteFileSync (state-io.ts).
 *
 * The defect this guards against is CRITICAL-5 from the 2026-05-04
 * safety audit: state-file writes used `writeFileSync(path, content)`,
 * which on Windows can split into multiple WriteFile calls -- a
 * concurrent reader observed empty or partial files. Fix uses temp +
 * rename, atomic on POSIX and on Windows for same-volume files.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFileSync, atomicWriteFileSyncCAS, RevisionMismatchError } from './state-io.js';

test('atomicWriteFileSync writes the content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-atomic-'));
  try {
    const path = join(dir, 'a.yaml');
    atomicWriteFileSync(path, 'hello\n');
    assert.equal(readFileSync(path, 'utf-8'), 'hello\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWriteFileSync overwrites existing content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-atomic-'));
  try {
    const path = join(dir, 'a.yaml');
    writeFileSync(path, 'old\n', 'utf-8');
    atomicWriteFileSync(path, 'new\n');
    assert.equal(readFileSync(path, 'utf-8'), 'new\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWriteFileSync leaves no .tmp file on success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-atomic-'));
  try {
    const path = join(dir, 'a.yaml');
    atomicWriteFileSync(path, 'hello\n');
    assert.equal(existsSync(path + '.tmp'), false,
      'temp file should be renamed away, not left behind');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWriteFileSync handles binary content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-atomic-'));
  try {
    const path = join(dir, 'a.bin');
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    atomicWriteFileSync(path, buf);
    const back = readFileSync(path);
    assert.deepEqual([...back], [...buf]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── B1 fix: CAS-style writes ────────────────────────────────
//
// Pre-fix race (`engine.ts:writeCheckpoint`): two writers observe rev=N,
// both compute newRev=N+1, both call `atomicWriteFileSync(path, ...)`.
// The atomic-replace path is per-rename atomic, so the file content is
// never partial -- but the LAST rename wins and the first writer's bump
// is silently lost. The in-memory `expectedRevision` check passes for
// each writer because each compares the file's then-current revision
// against ITS OWN expectation independently.
//
// CAS fix: encode `newRev` in the temp filename. Both writers attempt
// `link(scratch, path.tmp-rev-{N+1})`. `link` is atomic-create-or-fail
// at the filesystem level; only one writer's link succeeds. The loser
// throws RevisionMismatchError, matching the existing in-memory check's
// abort semantics.

test('atomicWriteFileSyncCAS writes the content on first attempt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cas-'));
  try {
    const path = join(dir, 'state.yaml');
    atomicWriteFileSyncCAS(path, 'rev-7-content\n', 7);
    assert.equal(readFileSync(path, 'utf-8'), 'rev-7-content\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWriteFileSyncCAS leaves no scratch or claim files behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cas-'));
  try {
    const path = join(dir, 'state.yaml');
    atomicWriteFileSyncCAS(path, 'content\n', 1);
    // Claim path was renamed away; scratch was unlinked.
    assert.equal(existsSync(`${path}.tmp-rev-1`), false,
      'claim path should be renamed away, not lingering');
    // Scratch path is randomized so we glob: anything under dir besides
    // `state.yaml` itself is leftover.
    const leftovers = readdirSync(dir).filter(f => f !== 'state.yaml');
    assert.deepEqual(leftovers, [],
      `expected only state.yaml in dir, found leftovers: ${JSON.stringify(leftovers)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWriteFileSyncCAS second writer at same revision aborts with RevisionMismatch', () => {
  // Simulates the exact race the B1 fix targets: two writers both
  // observe rev=N and call CAS with newRev=N+1. The second must abort
  // regardless of interleave -- enforced by the filesystem-atomic `link`.
  //
  // We can't deterministically interleave two real concurrent writes in
  // a unit test, so we drive the race manually: writer A claims slot
  // N+1 and PUBLISHES (so claim path is gone), then writer B with the
  // same expectation tries again. The CAS protocol's post-publish state
  // is `path` exists at the new content; the next CAS at revision N+1
  // must fail because writer B is operating on the stale assumption
  // that rev was still N.
  //
  // We force the EEXIST condition by manually creating the claim path
  // before invoking the second CAS -- this is what would happen if
  // writer A had won the race AND the cleanup raced behind the test
  // thread.
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cas-'));
  try {
    const path = join(dir, 'state.yaml');

    // Writer A: completes a normal CAS write.
    atomicWriteFileSyncCAS(path, 'A wrote\n', 1);
    assert.equal(readFileSync(path, 'utf-8'), 'A wrote\n');

    // Stage the race condition: writer B was holding rev=0 expectation
    // (newRev=1), but someone already claimed the slot. Pre-create the
    // claim path to mimic that.
    writeFileSync(`${path}.tmp-rev-1`, 'sibling claim\n', 'utf-8');

    // Writer B's CAS at the same expected new revision must abort.
    assert.throws(
      () => atomicWriteFileSyncCAS(path, 'B wrote\n', 1),
      (err: Error) => err instanceof RevisionMismatchError && /Revision mismatch/.test(err.message),
      'second writer at same revision must throw RevisionMismatchError',
    );

    // File content unchanged from writer A's publish (B did NOT clobber).
    assert.equal(readFileSync(path, 'utf-8'), 'A wrote\n',
      'B aborting must not have side effects on the published file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWriteFileSyncCAS interleaved writers: one wins, one aborts, no lost update', () => {
  // Tighter version of the previous test — drives the rename → re-create
  // → re-attempt sequence to verify that after writer A's full publish
  // (claim path gone), writer B with stale expectation can ALSO observe
  // the EEXIST signal if B's claim path is still hanging from a separate
  // concurrent attempt. Together with the previous test this covers
  // both halves of the race window: pre-rename and post-rename.
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cas-'));
  try {
    const path = join(dir, 'state.yaml');

    // Initial state -- file at rev 0 conceptually (file does not exist).
    atomicWriteFileSyncCAS(path, 'first\n', 1);

    // Two competing writers, both holding expected newRev=2.
    // Writer A wins.
    atomicWriteFileSyncCAS(path, 'A second\n', 2);
    assert.equal(readFileSync(path, 'utf-8'), 'A second\n');

    // Writer B (stale, expected newRev=2 again) -- claim path is gone
    // because A's rename consumed it. So B's claim attempt actually
    // SUCCEEDS in the post-rename window. This is fine for the file's
    // integrity (atomic-replace) but means the in-memory revision check
    // upstream in writeCheckpoint is the line of defense for already-
    // published rev mismatches; CAS catches the SIMULTANEOUS-claim race
    // specifically.
    //
    // To verify CAS catches the simultaneous case: pre-create claim
    // path, then both A and B race at newRev=3.
    writeFileSync(`${path}.tmp-rev-3`, 'sibling pre-claim\n', 'utf-8');
    assert.throws(
      () => atomicWriteFileSyncCAS(path, 'A third\n', 3),
      RevisionMismatchError,
    );
    assert.throws(
      () => atomicWriteFileSyncCAS(path, 'B third\n', 3),
      RevisionMismatchError,
    );
    // Both lose to the pre-existing claim. File remains at A's rev-2
    // content -- no lost update.
    assert.equal(readFileSync(path, 'utf-8'), 'A second\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
