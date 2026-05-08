/**
 * Tests for the lattice/platform/include template namespaces added in Phase 1
 * of the SENDEX/Lattice decoupling. The pre-existing inputs/nodes/state/env
 * paths are covered by other tests and not re-tested here.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { loadManifest } from './manifest.js';
import {
  buildInitialContext, resolveTemplate, TemplateIncludeError,
} from './template.js';

function makeProject(contents: { project?: string; platform?: string; files?: Record<string, string> }): string {
  const dir = mkdtempSync(join(tmpdir(), 'lattice-template-'));
  if (contents.project !== undefined) {
    writeFileSync(join(dir, 'lattice-project.toml'), contents.project, 'utf-8');
  }
  if (contents.platform !== undefined) {
    writeFileSync(join(dir, 'lattice-platform.toml'), contents.platform, 'utf-8');
  }
  for (const [path, content] of Object.entries(contents.files ?? {})) {
    const abs = join(dir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
  return dir;
}

// ── {{lattice.x.y}} resolution ─────────────────────────────────────

test('lattice.x.y resolves a string scalar from project.toml', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "npm run build"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('Build with: {{lattice.runtime.build_command}}', ctx);
    assert.equal(out, 'Build with: npm run build');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lattice.x.y resolves a number scalar (stringified)', () => {
  const dir = makeProject({
    project: `[runtime]\nbundle_size_baseline_kb = 1223\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('Baseline: {{lattice.runtime.bundle_size_baseline_kb}} KB', ctx);
    assert.equal(out, 'Baseline: 1223 KB');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lattice.x.y resolves an array (newline-joined for code-fence command lists)', () => {
  const dir = makeProject({
    project: `[runtime]\ndoc_regen_steps = [\n  "step-one.py",\n  "step-two.py",\n]\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('{{lattice.runtime.doc_regen_steps}}', ctx);
    assert.equal(out, 'step-one.py\nstep-two.py');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lattice.x.y on a nested sub-table key resolves through dotted path', () => {
  const dir = makeProject({
    project: `[skills.distill.corpus]\ndeep_read_budget = 15\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('Budget: {{lattice.skills.distill.corpus.deep_read_budget}}', ctx);
    assert.equal(out, 'Budget: 15');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lattice.x.y emits sentinel for undefined keys', () => {
  const dir = makeProject({ project: `[runtime]\nbuild_command = "x"\n` });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('{{lattice.project.docs.manifest_file}}', ctx);
    assert.equal(out, '<<UNDEFINED:lattice.project.docs.manifest_file>>');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lattice.x.y emits empty string for keys explicitly set to "" (greenfield opt-out)', () => {
  const dir = makeProject({
    project: `[project.docs]\nmanifest_file = ""\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('Manifest: [{{lattice.project.docs.manifest_file}}]', ctx);
    assert.equal(out, 'Manifest: []');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lattice.x.y emits sentinel when no manifest is loaded', () => {
  const ctx = buildInitialContext({}, {}, undefined);
  const out = resolveTemplate('{{lattice.runtime.build_command}}', ctx);
  assert.equal(out, '<<UNDEFINED:lattice.runtime.build_command>>');
});

// ── {{platform.x.y}} resolution ─────────────────────────────────

test('platform.x.y resolves from lattice-platform.toml', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "x"\n`,
    platform: `[platform]\nname = "datagrok"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('Platform: {{platform.platform.name}}', ctx);
    assert.equal(out, 'Platform: datagrok');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('platform.x.y emits sentinel when platform.toml is absent', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "x"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('{{platform.platform.name}}', ctx);
    assert.equal(out, '<<UNDEFINED:platform.platform.name>>');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── {{include:project.x.y}} resolution ─────────────────────

test('include:project.x.y inlines the file at the path stored at x.y', () => {
  const dir = makeProject({
    project: `[skills.review]\ndomain_expertise = "skill-content/review-de.md"\n`,
    files: {
      'skill-content/review-de.md': 'You are an expert in pre-clinical SEND data.\nBlah blah.',
    },
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('Persona: {{include:project.skills.review.domain_expertise}}', ctx);
    assert.equal(out, 'Persona: You are an expert in pre-clinical SEND data.\nBlah blah.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include: path resolves relative to project root, not cwd', () => {
  const dir = makeProject({
    project: `[skills.x]\nhelper = "subdir/h.md"\n`,
  });
  // makeProject's writeFileSync doesn't auto-create subdirs; do it explicitly.
  mkdirSync(join(dir, 'subdir'), { recursive: true });
  writeFileSync(join(dir, 'subdir', 'h.md'), 'helper content', 'utf-8');
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('{{include:project.skills.x.helper}}', ctx);
    assert.equal(out, 'helper content');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include: throws TemplateIncludeError when the manifest key is undefined', () => {
  const dir = makeProject({
    project: `[skills.review]\npersona = "x"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    assert.throws(
      () => resolveTemplate('{{include:project.skills.review.domain_expertise}}', ctx),
      (e: Error) => {
        assert.ok(e instanceof TemplateIncludeError);
        assert.match(e.message, /'project\.skills\.review\.domain_expertise' is undefined/);
        return true;
      },
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include: throws when the key is set to "" (intentionally-undefined marker)', () => {
  const dir = makeProject({
    project: `[skills.review]\ndomain_expertise = ""\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    assert.throws(
      () => resolveTemplate('{{include:project.skills.review.domain_expertise}}', ctx),
      (e: Error) => {
        assert.ok(e instanceof TemplateIncludeError);
        assert.match(e.message, /is empty/);
        return true;
      },
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include: throws when the file does not exist', () => {
  const dir = makeProject({
    project: `[skills.review]\ndomain_expertise = "skill-content/missing.md"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    assert.throws(
      () => resolveTemplate('{{include:project.skills.review.domain_expertise}}', ctx),
      (e: Error) => {
        assert.ok(e instanceof TemplateIncludeError);
        assert.match(e.message, /file not found/);
        return true;
      },
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include: throws when no manifest is loaded', () => {
  const ctx = buildInitialContext({}, {}, undefined);
  assert.throws(
    () => resolveTemplate('{{include:project.skills.review.domain_expertise}}', ctx),
    (e: Error) => {
      assert.ok(e instanceof TemplateIncludeError);
      assert.match(e.message, /no manifest loaded/);
      return true;
    },
  );
});

test('include: rejects non-project namespaces (e.g. include:platform.X)', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "x"\n`,
    platform: `[platform]\nname = "datagrok"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    assert.throws(
      () => resolveTemplate('{{include:platform.platform.name}}', ctx),
      (e: Error) => {
        assert.ok(e instanceof TemplateIncludeError);
        assert.match(e.message, /only 'include:project\.X\.Y'/);
        return true;
      },
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── {{include:optional:project.x.y}} resolution (ENH-09) ───

test('include:optional inlines the file when the key resolves (positive case)', () => {
  const dir = makeProject({
    project: `[skills.review]\ncapability_model = "skill-content/caps.md"\n`,
    files: {
      'skill-content/caps.md': 'Pillar 1: x\nPillar 2: y',
    },
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('Caps:\n{{include:optional:project.skills.review.capability_model}}', ctx);
    assert.equal(out, 'Caps:\nPillar 1: x\nPillar 2: y');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include:optional returns empty string when the manifest key is undefined', () => {
  const dir = makeProject({
    project: `[skills.review]\npersona = "x"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('A[{{include:optional:project.skills.review.capability_model}}]B', ctx);
    assert.equal(out, 'A[]B');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include:optional returns empty string when the key is set to ""', () => {
  const dir = makeProject({
    project: `[skills.review]\ncapability_model = ""\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('[{{include:optional:project.skills.review.capability_model}}]', ctx);
    assert.equal(out, '[]');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include:optional returns empty string when the file does not exist', () => {
  const dir = makeProject({
    project: `[skills.review]\ncapability_model = "skill-content/missing.md"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    const out = resolveTemplate('[{{include:optional:project.skills.review.capability_model}}]', ctx);
    assert.equal(out, '[]');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include:optional returns empty string when no manifest is loaded', () => {
  const ctx = buildInitialContext({}, {}, undefined);
  const out = resolveTemplate('[{{include:optional:project.skills.review.capability_model}}]', ctx);
  assert.equal(out, '[]');
});

test('include:optional STILL throws when the value is wrong type (misconfig, not absence)', () => {
  const dir = makeProject({
    project: `[skills.review]\ncapability_model = 42\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    assert.throws(
      () => resolveTemplate('{{include:optional:project.skills.review.capability_model}}', ctx),
      (e: Error) => {
        assert.ok(e instanceof TemplateIncludeError);
        assert.match(e.message, /is not a string path/);
        return true;
      },
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('include:optional rejects non-project namespaces', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "x"\n`,
    platform: `[platform]\nname = "datagrok"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({}, {}, undefined, m);
    assert.throws(
      () => resolveTemplate('{{include:optional:platform.platform.name}}', ctx),
      (e: Error) => {
        assert.ok(e instanceof TemplateIncludeError);
        assert.match(e.message, /only 'include:project\.X\.Y'/);
        return true;
      },
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Mixed substitution: existing namespaces still work ──────

test('lattice.x.y coexists with inputs.X in the same template', () => {
  const dir = makeProject({
    project: `[runtime]\nbuild_command = "npm run build"\n`,
  });
  try {
    const m = loadManifest(dir);
    const ctx = buildInitialContext({ topic: 'cohort-view' }, {}, undefined, m);
    const out = resolveTemplate('Topic {{inputs.topic}} runs {{lattice.runtime.build_command}}', ctx);
    assert.equal(out, 'Topic cohort-view runs npm run build');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
