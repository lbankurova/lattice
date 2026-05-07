/**
 * Tests for manifest.ts loader + minimal TOML subset parser.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadManifest, lookupKey, formatValue, surfaceManifestEnv,
  ManifestError, UNDEFINED_SENTINEL_PREFIX,
} from './manifest.js';

function makeProject(contents: { project?: string; platform?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-manifest-'));
  if (contents.project !== undefined) {
    writeFileSync(join(dir, 'lattice-project.toml'), contents.project, 'utf-8');
  }
  if (contents.platform !== undefined) {
    writeFileSync(join(dir, 'lattice-platform.toml'), contents.platform, 'utf-8');
  }
  return dir;
}

// ── Greenfield: no TOML files ────────────────────────────────────────

test('loadManifest: greenfield (no TOML) returns hasProject=false, empty sections', () => {
  const dir = makeProject({});
  try {
    const m = loadManifest(dir);
    assert.equal(m.hasProject, false);
    assert.equal(m.hasPlatform, false);
    assert.deepEqual(m.project, {});
    assert.deepEqual(m.platform, {});
    assert.equal(m.projectRoot, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: lookupKey on absent manifest returns undefined', () => {
  const dir = makeProject({});
  try {
    const m = loadManifest(dir);
    assert.equal(lookupKey(m.project, 'runtime.build_command'), undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Well-formed project TOML ────────────────────────────────────────

test('loadManifest: top-level table + string scalar', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "npm run build"\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.equal(m.hasProject, true);
    assert.equal(lookupKey(m.project, 'runtime.build_command'), 'npm run build');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: dotted-table headers create nested sections', () => {
  const dir = makeProject({
    project: `[skills.distill.corpus]\ndeep_read_budget = 15\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.equal(lookupKey(m.project, 'skills.distill.corpus.deep_read_budget'), 15);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: string array on one line', () => {
  const dir = makeProject({
    project: `[skills.review.architect]\nexclude_globs = ["a.md", "b.md"]\n`,
  });
  try {
    const m = loadManifest(dir);
    const v = lookupKey(m.project, 'skills.review.architect.exclude_globs');
    assert.deepEqual(v, ['a.md', 'b.md']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: multi-line array with comments and blank lines', () => {
  const dir = makeProject({
    project: `[skills.distill.corpus]
always_full = [
  "a.md",
  # mid-array comment
  "b.md",

  "c.md",
]
`,
  });
  try {
    const m = loadManifest(dir);
    const v = lookupKey(m.project, 'skills.distill.corpus.always_full');
    assert.deepEqual(v, ['a.md', 'b.md', 'c.md']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: empty array', () => {
  const dir = makeProject({
    project: `[runtime]\ndoc_regen_steps = []\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.deepEqual(lookupKey(m.project, 'runtime.doc_regen_steps'), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: integer scalar', () => {
  const dir = makeProject({
    project: `[runtime]\nbundle_size_baseline_kb = 1223\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.equal(lookupKey(m.project, 'runtime.bundle_size_baseline_kb'), 1223);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: trailing comment on key=value line', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "npm run build"  # the build cmd\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.equal(lookupKey(m.project, 'runtime.build_command'), 'npm run build');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: empty string value preserved (greenfield opt-out marker)', () => {
  const dir = makeProject({
    project: `[project.docs]\nmanifest_file = ""\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.equal(lookupKey(m.project, 'project.docs.manifest_file'), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Platform manifest ────────────────────────────────────────

test('loadManifest: platform.toml present surfaces platform section', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "x"\n`,
    platform: `[platform]\nname = "datagrok"\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.equal(m.hasPlatform, true);
    assert.equal(lookupKey(m.platform, 'platform.name'), 'datagrok');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: platform.toml absent leaves hasPlatform=false', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "x"\n`,
  });
  try {
    const m = loadManifest(dir);
    assert.equal(m.hasPlatform, false);
    assert.deepEqual(m.platform, {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Malformed TOML throws ──────────────────────────────────

test('loadManifest: malformed section header throws ManifestError with line', () => {
  const dir = makeProject({ project: `[bad header\nfoo = "bar"\n` });
  try {
    assert.throws(() => loadManifest(dir), (e: Error) => {
      assert.ok(e instanceof ManifestError);
      assert.match(e.message, /:1:/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: missing equals throws ManifestError', () => {
  const dir = makeProject({ project: `[runtime]\nbuild_command "no equals"\n` });
  try {
    assert.throws(() => loadManifest(dir), (e: Error) => {
      assert.ok(e instanceof ManifestError);
      assert.match(e.message, /Expected 'key = value'/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: unterminated string throws', () => {
  const dir = makeProject({ project: `[runtime]\nbuild = "unclosed\n` });
  try {
    assert.throws(() => loadManifest(dir), (e: Error) => {
      assert.ok(e instanceof ManifestError);
      assert.match(e.message, /Unterminated string/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: unterminated multi-line array throws', () => {
  const dir = makeProject({ project: `[skills.x]\nlist = [\n  "a",\n  "b",\n` });
  try {
    assert.throws(() => loadManifest(dir), (e: Error) => {
      assert.ok(e instanceof ManifestError);
      assert.match(e.message, /Unterminated array/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadManifest: unsupported value type (boolean) throws', () => {
  const dir = makeProject({ project: `[runtime]\nflag = true\n` });
  try {
    assert.throws(() => loadManifest(dir), (e: Error) => {
      assert.ok(e instanceof ManifestError);
      assert.match(e.message, /Unsupported value type/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── formatValue ────────────────────────────────────────────

test('formatValue: undefined emits sentinel with dotted key', () => {
  assert.equal(formatValue(undefined, 'runtime.missing'), '<<UNDEFINED:runtime.missing>>');
});

test('formatValue: string returns as-is', () => {
  assert.equal(formatValue('hello', 'k'), 'hello');
});

test('formatValue: empty string is empty (NOT sentinel)', () => {
  assert.equal(formatValue('', 'k'), '');
});

test('formatValue: number stringifies', () => {
  assert.equal(formatValue(1223, 'k'), '1223');
});

test('formatValue: array of strings joins with newlines', () => {
  assert.equal(formatValue(['a', 'b', 'c'], 'k'), 'a\nb\nc');
});

test('formatValue: empty array yields empty string', () => {
  assert.equal(formatValue([], 'k'), '');
});

test('formatValue: object emits object-sentinel', () => {
  assert.ok(formatValue({ a: 'b' }, 'k').startsWith(UNDEFINED_SENTINEL_PREFIX));
});

// ── lookupKey ───────────────────────────────────────────────

test('lookupKey: nested dotted path resolves', () => {
  const s = { a: { b: { c: 'x' } } };
  assert.equal(lookupKey(s, 'a.b.c'), 'x');
});

test('lookupKey: missing intermediate returns undefined', () => {
  const s = { a: { b: 'leaf' } };
  // a.b is a leaf (string), so a.b.c traversal must return undefined
  assert.equal(lookupKey(s, 'a.b.c'), undefined);
});

test('lookupKey: empty section returns undefined for any key', () => {
  assert.equal(lookupKey({}, 'a.b.c'), undefined);
});

// ── surfaceManifestEnv ──────────────────────────────────────

test('surfaceManifestEnv: scalar keys flatten with LATTICE_PROJECT_ prefix', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "npm run build"\n`,
  });
  try {
    const m = loadManifest(dir);
    const env = surfaceManifestEnv(m);
    assert.equal(env['LATTICE_PROJECT_RUNTIME_BUILD_COMMAND'], 'npm run build');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('surfaceManifestEnv: dotted-table keys flatten with all segments', () => {
  const dir = makeProject({
    project: `[skills.distill.corpus]\ndeep_read_budget = 15\n`,
  });
  try {
    const m = loadManifest(dir);
    const env = surfaceManifestEnv(m);
    assert.equal(env['LATTICE_PROJECT_SKILLS_DISTILL_CORPUS_DEEP_READ_BUDGET'], '15');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('surfaceManifestEnv: arrays join with newlines', () => {
  const dir = makeProject({
    project: `[skills.review.architect]\nexclude_globs = ["a.md", "b.md"]\n`,
  });
  try {
    const m = loadManifest(dir);
    const env = surfaceManifestEnv(m);
    assert.equal(env['LATTICE_PROJECT_SKILLS_REVIEW_ARCHITECT_EXCLUDE_GLOBS'], 'a.md\nb.md');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('surfaceManifestEnv: platform.toml uses LATTICE_PLATFORM_ prefix', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "x"\n`,
    platform: `[platform]\nname = "datagrok"\n`,
  });
  try {
    const m = loadManifest(dir);
    const env = surfaceManifestEnv(m);
    assert.equal(env['LATTICE_PLATFORM_PLATFORM_NAME'], 'datagrok');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('surfaceManifestEnv: empty string scalars are preserved (greenfield opt-out)', () => {
  const dir = makeProject({
    project: `[project.docs]\nmanifest_file = ""\n`,
  });
  try {
    const m = loadManifest(dir);
    const env = surfaceManifestEnv(m);
    assert.equal(env['LATTICE_PROJECT_PROJECT_DOCS_MANIFEST_FILE'], '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
