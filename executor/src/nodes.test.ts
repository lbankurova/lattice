/**
 * Tests for nodes.ts: condition evaluator, gate routing, exists/!exists
 * filesystem checks.
 *
 * Created for B3 (`!exists()` actually checks the filesystem). Pre-fix
 * `nodes.ts:387-390` returned `false` unconditionally for `!exists(...)`
 * and fell through to the truthy-string branch for `exists(...)`. Gates
 * depending on either predicate silently took the wrong branch.
 *
 * Stream E F1 will expand this file; landing the B3 case here is the
 * minimum-viable seed.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateCondition, pathExists } from './nodes.js';

// ── pathExists primitive ────────────────────────────────────

test('pathExists returns true for an existing relative path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-exists-'));
  try {
    writeFileSync(join(dir, 'present.yaml'), 'x: 1', 'utf-8');
    assert.equal(pathExists('present.yaml', dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pathExists returns false for a missing relative path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-exists-'));
  try {
    assert.equal(pathExists('absent.yaml', dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pathExists honors absolute paths verbatim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-exists-'));
  try {
    const abs = join(dir, 'a.txt');
    writeFileSync(abs, 'hello', 'utf-8');
    // Absolute path should resolve regardless of cwd argument.
    assert.equal(pathExists(abs, '/some/unrelated/cwd'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── evaluateCondition with !exists / exists ─────────────────

test('!exists(path): returns true when path is missing (B3 fix)', () => {
  // Pre-fix this returned `false` unconditionally because the executor
  // had a "Would need filesystem check" comment-only stub. Gates that
  // routed on `!exists('foo')` always took the false branch -- exactly
  // the wrong branch when foo was actually missing.
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cond-'));
  try {
    assert.equal(evaluateCondition("!exists('missing.txt')", dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('!exists(path): returns false when path is present (B3 fix)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cond-'));
  try {
    writeFileSync(join(dir, 'present.txt'), 'x', 'utf-8');
    assert.equal(evaluateCondition("!exists('present.txt')", dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exists(path): returns true when path is present (B3 fix)', () => {
  // Pre-fix the positive form fell through to the "non-empty string is
  // truthy" branch and unconditionally returned `true` -- a different
  // failure mode than the negative form, but with the same root cause
  // (no filesystem check at all).
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cond-'));
  try {
    writeFileSync(join(dir, 'present.txt'), 'x', 'utf-8');
    assert.equal(evaluateCondition("exists('present.txt')", dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exists(path): returns false when path is missing (B3 fix)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cond-'));
  try {
    assert.equal(evaluateCondition("exists('missing.txt')", dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('!exists composes with && and ||', () => {
  // Standard precedence test -- || is looser than &&.
  const dir = mkdtempSync(join(tmpdir(), 'lattice-cond-'));
  try {
    writeFileSync(join(dir, 'a.txt'), '', 'utf-8');
    // `!exists('a.txt') || true` -- left is false, right is true, OR is true
    assert.equal(evaluateCondition("!exists('a.txt') || true", dir), true);
    // `exists('a.txt') && !exists('b.txt')` -- both true, AND is true
    assert.equal(evaluateCondition("exists('a.txt') && !exists('b.txt')", dir), true);
    // `exists('a.txt') && exists('b.txt')` -- right is false, AND is false
    assert.equal(evaluateCondition("exists('a.txt') && exists('b.txt')", dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── existing condition forms still work ─────────────────────

test('== / != still work (no regression from B3)', () => {
  // Note the asymmetric form: the LHS is unquoted (template-resolved
  // value), the RHS is a literal in single quotes. This matches the
  // workflow-condition convention where LHS is `{{nodes.X.output.verdict}}`
  // template-resolved to a bare value.
  assert.equal(evaluateCondition("foo == 'foo'"), true);
  assert.equal(evaluateCondition("foo == 'bar'"), false);
  assert.equal(evaluateCondition("foo != 'bar'"), true);
});

test('contains() still works (no regression from B3)', () => {
  assert.equal(evaluateCondition("'foobar'.contains('oba')"), true);
  assert.equal(evaluateCondition("'foobar'.contains('xyz')"), false);
});
