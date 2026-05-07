/**
 * Tests for the lattice-project.toml [project.backlog] todo lookup added in
 * Phase 2 of the SENDEX/Lattice decoupling. Pre-existing fallback-chain
 * behavior is verified to still apply when the manifest key is absent.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findTodoFile } from './todo-queue.js';

function makeProject(spec: { tomlBacklog?: string; files?: Record<string, string> }): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-todoq-'));
  if (spec.tomlBacklog !== undefined) {
    writeFileSync(
      join(dir, 'lattice-project.toml'),
      `[project.backlog]\ntodo = "${spec.tomlBacklog}"\n`,
      'utf-8',
    );
  }
  for (const [path, content] of Object.entries(spec.files ?? {})) {
    const abs = join(dir, path);
    mkdirSync(resolve(abs, '..'), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
  return dir;
}

test('findTodoFile: manifest key wins over candidate-chain default', () => {
  const dir = makeProject({
    tomlBacklog: 'custom/path/MY-TODO.md',
    files: {
      'docs/_internal/TODO.md': 'default',  // would normally win the chain
      'custom/path/MY-TODO.md': 'configured',
    },
  });
  try {
    const found = findTodoFile(dir);
    assert.equal(found, resolve(dir, 'custom/path/MY-TODO.md'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('findTodoFile: manifest key set to empty string falls through to candidate chain', () => {
  // empty string = greenfield opt-out marker; resolution falls through.
  const dir = makeProject({
    tomlBacklog: '',
    files: {
      'docs/_internal/TODO.md': 'default',
    },
  });
  try {
    const found = findTodoFile(dir);
    assert.equal(found, resolve(dir, 'docs/_internal/TODO.md'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('findTodoFile: no manifest, candidate chain still works (back-compat)', () => {
  const dir = makeProject({
    files: {
      'docs/_internal/TODO.md': 'default',
    },
  });
  try {
    const found = findTodoFile(dir);
    assert.equal(found, resolve(dir, 'docs/_internal/TODO.md'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('findTodoFile: manifest key points to nonexistent path returns null (no chain fallback)', () => {
  // When a project explicitly configures a path, missing-file is a real error,
  // not "fall through to whatever else exists." Returning null lets the caller
  // surface "your configured TODO is missing" rather than silently picking the
  // wrong file.
  const dir = makeProject({
    tomlBacklog: 'configured/MY-TODO.md',
    files: {
      'docs/_internal/TODO.md': 'default-but-not-configured',
    },
  });
  try {
    const found = findTodoFile(dir);
    assert.equal(found, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('findTodoFile: greenfield (no manifest, no TODO.md) returns null', () => {
  const dir = makeProject({});
  try {
    assert.equal(findTodoFile(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
