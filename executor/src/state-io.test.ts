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
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFileSync } from './state-io.js';

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
