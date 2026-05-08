/**
 * Tests for the [project.specs] archive lookup added in Phase 2.
 * Verifies resolveArchiveDir() honors the manifest key, falls back when
 * absent or empty-string, and resolves paths relative to project root.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveArchiveDir } from './reconcile.js';

function makeProject(spec: { tomlArchive?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-reconcile-'));
  if (spec.tomlArchive !== undefined) {
    writeFileSync(
      join(dir, 'lattice-project.toml'),
      `[project.specs]\narchive = "${spec.tomlArchive}"\n`,
      'utf-8',
    );
  }
  return dir;
}

test('archive resolution: manifest key wins', () => {
  const dir = makeProject({ tomlArchive: 'custom/spec-archive' });
  try {
    assert.equal(resolveArchiveDir(dir), resolve(dir, 'custom/spec-archive'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('archive resolution: empty string falls back to SENDEX default', () => {
  const dir = makeProject({ tomlArchive: '' });
  try {
    assert.equal(resolveArchiveDir(dir), resolve(dir, 'docs/_internal/incoming/archive'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('archive resolution: no manifest falls back to SENDEX default', () => {
  const dir = makeProject({});
  try {
    assert.equal(resolveArchiveDir(dir), resolve(dir, 'docs/_internal/incoming/archive'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('archive resolution: configured directory exists when written', () => {
  const dir = makeProject({ tomlArchive: 'archived-specs' });
  mkdirSync(join(dir, 'archived-specs'), { recursive: true });
  writeFileSync(join(dir, 'archived-specs', 'foo-synthesis.md'), '# foo', 'utf-8');
  try {
    const archiveDir = resolveArchiveDir(dir);
    assert.ok(existsSync(archiveDir));
    assert.equal(archiveDir, resolve(dir, 'archived-specs'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
