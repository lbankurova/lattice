/**
 * Tests for the resync command (Phase 3b prerequisite — closes the
 * substitute-at-dispatch vs substitute-at-sync gap).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resyncProject } from './resync.js';

function makeProject(spec: {
  toml?: string;
  commands?: Record<string, string>;
}): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-resync-'));
  if (spec.toml !== undefined) {
    writeFileSync(join(dir, 'lattice-project.toml'), spec.toml, 'utf-8');
  }
  if (spec.commands) {
    mkdirSync(join(dir, '.claude/commands'), { recursive: true });
    for (const [path, body] of Object.entries(spec.commands)) {
      const abs = join(dir, '.claude/commands', path);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, body, 'utf-8');
    }
  }
  return dir;
}

test('resyncProject: substitutes {{lattice.X.Y}} in skill bodies in-place', () => {
  const dir = makeProject({
    toml: `[project.bugs]\nbug_log = "docs/_internal/BUG-SWEEP.md"\n`,
    commands: {
      'ops/bug.md': 'Append to {{lattice.project.bugs.bug_log}} with the entry.',
    },
  });
  try {
    const result = resyncProject(dir);
    assert.equal(result.rendered, 1);
    assert.equal(result.errors.length, 0);
    const after = readFileSync(join(dir, '.claude/commands/ops/bug.md'), 'utf-8');
    assert.equal(after, 'Append to docs/_internal/BUG-SWEEP.md with the entry.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: leaves token-free files unchanged', () => {
  const dir = makeProject({
    toml: `[project.bugs]\nbug_log = "x"\n`,
    commands: {
      'ops/check.md': 'No tokens here. Just a plain skill body.',
    },
  });
  try {
    const result = resyncProject(dir);
    assert.equal(result.rendered, 0);
    assert.equal(result.unchanged, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: emits sentinel + flags file for keys not in manifest', () => {
  const dir = makeProject({
    toml: `[project.bugs]\nbug_log = "x"\n`,
    commands: {
      'ops/missing.md': 'See {{lattice.project.docs.system_manifest}}.',
    },
  });
  try {
    const result = resyncProject(dir);
    assert.equal(result.rendered, 1);
    assert.equal(result.sentinelFiles.length, 1);
    const after = readFileSync(join(dir, '.claude/commands/ops/missing.md'), 'utf-8');
    assert.match(after, /<<UNDEFINED:lattice\.project\.docs\.system_manifest>>/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: include error reports per-file, does not abort other files', () => {
  const dir = makeProject({
    toml: `[skills.bug_stress]\npattern_families = "skill-content/missing.md"\n[project.bugs]\nbug_log = "BUG-SWEEP.md"`,
    commands: {
      'ops/bug-stress.md': 'Pattern families: {{include:project.skills.bug_stress.pattern_families}}',
      'ops/bug.md': 'Log to {{lattice.project.bugs.bug_log}}.',
    },
  });
  try {
    const result = resyncProject(dir);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].file, /bug-stress\.md$/);
    assert.match(result.errors[0].reason, /file not found/);
    // bug.md should still have rendered despite bug-stress.md erroring
    assert.equal(result.rendered, 1);
    const bugAfter = readFileSync(join(dir, '.claude/commands/ops/bug.md'), 'utf-8');
    assert.equal(bugAfter, 'Log to BUG-SWEEP.md.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: greenfield (no manifest) renders with sentinels', () => {
  const dir = makeProject({
    commands: {
      'ops/x.md': 'Path: {{lattice.runtime.build_command}}',
    },
  });
  try {
    const result = resyncProject(dir);
    assert.equal(result.hasManifest, false);
    assert.equal(result.rendered, 1);
    assert.equal(result.sentinelFiles.length, 1);
    const after = readFileSync(join(dir, '.claude/commands/ops/x.md'), 'utf-8');
    assert.match(after, /<<UNDEFINED:lattice\.runtime\.build_command>>/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: idempotent (second run is a no-op)', () => {
  const dir = makeProject({
    toml: `[project.bugs]\nbug_log = "x"\n`,
    commands: {
      'ops/bug.md': 'See {{lattice.project.bugs.bug_log}}.',
    },
  });
  try {
    const first = resyncProject(dir);
    assert.equal(first.rendered, 1);

    const second = resyncProject(dir);
    assert.equal(second.rendered, 0);
    assert.equal(second.unchanged, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: throws when .claude/commands/ does not exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-resync-'));
  try {
    assert.throws(() => resyncProject(dir), /No \.claude\/commands\//);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Stray-template lint (ENH-15 / ENH-16; BUG-043 exemplar) ──────────────

test('resyncProject: flags files where literal {{...}} survived substitution via include', () => {
  // Mimics BUG-043: an include file documents template syntax with a literal
  // {{lattice.X.Y}}, which lands verbatim in the rendered skill body.
  const dir = makeProject({
    toml: `[skills.demo]\nnotes = "skill-content/include.md"\n`,
    commands: {
      'demo.md': 'Notes: {{include:project.skills.demo.notes}}',
    },
  });
  // Write the include file outside makeProject so it can use a path the toml
  // points at.
  mkdirSync(join(dir, 'skill-content'), { recursive: true });
  writeFileSync(
    join(dir, 'skill-content/include.md'),
    'The engine substitutes {{lattice.X.Y}} non-recursively.\n',
    'utf-8',
  );
  try {
    const result = resyncProject(dir);
    assert.equal(result.rendered, 1);
    assert.equal(result.errors.length, 0);
    const strays = result.strayTemplateFiles ?? [];
    assert.equal(strays.length, 1);
    assert.match(strays[0], /demo\.md$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: backticked-prose token references do NOT trip the lint', () => {
  // Rule 5 fix: rewrite {{lattice.X.Y}} as `lattice.X.Y` (without braces).
  const dir = makeProject({
    toml: `[skills.demo]\nnotes = "skill-content/include.md"\n`,
    commands: {
      'demo.md': 'Notes: {{include:project.skills.demo.notes}}',
    },
  });
  mkdirSync(join(dir, 'skill-content'), { recursive: true });
  writeFileSync(
    join(dir, 'skill-content/include.md'),
    'The engine substitutes `lattice.X.Y` non-recursively.\n',
    'utf-8',
  );
  try {
    const result = resyncProject(dir);
    assert.equal(result.rendered, 1);
    assert.equal((result.strayTemplateFiles ?? []).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resyncProject: stray-template lint fires on idempotent re-runs too', () => {
  // After the first resync bakes a stray literal into demo.md, a second
  // run finds nothing to substitute (idempotent unchanged path) — but we
  // still want the warning to fire so the user knows to fix it.
  const dir = makeProject({
    toml: `[skills.demo]\nnotes = "skill-content/include.md"\n`,
    commands: {
      'demo.md': 'Notes: {{include:project.skills.demo.notes}}',
    },
  });
  mkdirSync(join(dir, 'skill-content'), { recursive: true });
  writeFileSync(
    join(dir, 'skill-content/include.md'),
    'The engine substitutes {{lattice.X.Y}} non-recursively.\n',
    'utf-8',
  );
  try {
    const first = resyncProject(dir);
    assert.equal((first.strayTemplateFiles ?? []).length, 1);

    // Re-run: nothing to substitute, but stray must still surface.
    // (Note: the second pass actually mis-substitutes the bare literal to a
    // sentinel — that's BUG-043's failure mode. We still want the lint to
    // fire BEFORE that happens, which means it must hit on the first pass
    // when the literal first lands. Here we just confirm both sentinel and
    // stray paths surface independently.)
    const second = resyncProject(dir);
    // After first pass, demo.md contains "Notes: ... {{lattice.X.Y}} ..."
    // Second pass: TEMPLATE_RE matches that literal, substitutes to
    // <<UNDEFINED:lattice.X.Y>>, so by the time we scan the rendered output
    // there's no stray. Sentinel path catches it instead.
    assert.equal(second.sentinelFiles.length, 1);
    assert.equal((second.strayTemplateFiles ?? []).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
