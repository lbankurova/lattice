/**
 * Tests for the verdict-enum validate-time check (A2).
 *
 * Stream A item A2 of `lattice-self-fix-2026-05-05.md`. Pre-A2, a typo'd
 * verdict literal (`'PSS'` for `'PASS'`) parsed as a valid expression that
 * matched zero outputs at runtime; the workflow then took the `default`
 * route. A2 rejects unknown literals at workflow-load time.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow, _resetVerdictRegistryCache, WorkflowLoadError } from './loader.js';

function setupRegistry(dir: string): void {
  writeFileSync(join(dir, 'verdict-enums.yaml'), `
version: 1
enums:
  architect:
    members: [PASS, SIMPLIFY, REJECT, SCIENCE-FLAG]
  peer-review:
    members: [SOUND, CONDITIONAL, FLAWED, INSUFFICIENT]
  ops-check:
    members: [PASS, FAIL]
aliases:
  architect-reviewer: architect
`);
}

function writeWorkflow(dir: string, body: string): string {
  const path = join(dir, 'test-wf.yaml');
  writeFileSync(path, body);
  return path;
}

function freshTmpDir(): string {
  _resetVerdictRegistryCache();
  return mkdtempSync(join(tmpdir(), 'lattice-verdict-test-'));
}

test('typo verdict rejected at load time', () => {
  const dir = freshTmpDir();
  try {
    setupRegistry(dir);
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: typo case
  nodes:
    review:
      type: skill
      skill: lattice/peer-review
      verdict_enum: peer-review
    evaluate:
      type: gate
      depends_on: [review]
      evaluate:
        - condition: "{{nodes.review.output.verdict}} == 'SUOND'"
          route: distill
        - condition: default
          route: distill
    distill:
      type: bash
      command: "true"
      depends_on: [evaluate]
`);

    let caught: Error | null = null;
    try { loadWorkflow(wf); } catch (e) { caught = e as Error; }
    assert.ok(caught, 'expected loadWorkflow to throw on typo verdict');
    assert.ok(caught instanceof WorkflowLoadError,
      `expected WorkflowLoadError, got ${caught?.constructor?.name}: ${caught?.message}`);
    assert.match(caught!.message, /SUOND/, `error message should name the typo, got: ${caught!.message}`);
    assert.match(caught!.message, /peer-review/, `error message should name the enum, got: ${caught!.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('valid verdict accepted', () => {
  const dir = freshTmpDir();
  try {
    setupRegistry(dir);
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: valid case
  nodes:
    review:
      type: skill
      skill: lattice/peer-review
      verdict_enum: peer-review
    evaluate:
      type: gate
      depends_on: [review]
      evaluate:
        - condition: "{{nodes.review.output.verdict}} == 'SOUND'"
          route: distill
        - condition: "{{nodes.review.output.verdict}} == 'CONDITIONAL'"
          route: distill
        - condition: default
          route: distill
    distill:
      type: bash
      command: "true"
      depends_on: [evaluate]
`);

    const loaded = loadWorkflow(wf);
    assert.equal(loaded.name, 'test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('opt-in: unannotated producer skips verdict-enum check', () => {
  // Pre-A2 workflows without verdict_enum on the producing node remain valid.
  const dir = freshTmpDir();
  try {
    setupRegistry(dir);
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: legacy unannotated case
  nodes:
    review:
      type: skill
      skill: lattice/peer-review
      # NOTE: no verdict_enum -- legacy producer
    evaluate:
      type: gate
      depends_on: [review]
      evaluate:
        - condition: "{{nodes.review.output.verdict}} == 'GIBBERISH'"
          route: distill
        - condition: default
          route: distill
    distill:
      type: bash
      command: "true"
      depends_on: [evaluate]
`);

    // Must NOT throw — opt-in semantics keep legacy workflows valid.
    const loaded = loadWorkflow(wf);
    assert.equal(loaded.name, 'test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('alias resolves to canonical enum', () => {
  const dir = freshTmpDir();
  try {
    setupRegistry(dir);
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: alias case
  nodes:
    architect:
      type: skill
      skill: null
      agent_type: architect-reviewer
      verdict_enum: architect-reviewer   # alias for 'architect'
    evaluate:
      type: gate
      depends_on: [architect]
      evaluate:
        - condition: "{{nodes.architect.output.verdict}} == 'SIMPLIFY'"
          route: distill
        - condition: default
          route: distill
    distill:
      type: bash
      command: "true"
      depends_on: [evaluate]
`);

    const loaded = loadWorkflow(wf);
    assert.equal(loaded.name, 'test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contains() form with known prefix is validated', () => {
  const dir = freshTmpDir();
  try {
    setupRegistry(dir);
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: contains form
  nodes:
    second-gate:
      type: skill
      skill: null
      verdict_enum: architect
    evaluate:
      type: gate
      depends_on: [second-gate]
      evaluate:
        - condition: "{{nodes.second-gate.output}}.contains('SECOND_GATE_VERDICT=NOTAVERDICT')"
          route: distill
        - condition: default
          route: distill
    distill:
      type: bash
      command: "true"
      depends_on: [evaluate]
`);

    assert.throws(
      () => loadWorkflow(wf),
      (err: Error) =>
        err instanceof WorkflowLoadError &&
        err.message.includes('NOTAVERDICT') &&
        err.message.includes('architect'),
      'contains() with bad literal should be rejected'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown enum name surfaces a clear error', () => {
  const dir = freshTmpDir();
  try {
    setupRegistry(dir);
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: misnamed enum
  nodes:
    review:
      type: skill
      skill: null
      verdict_enum: this-enum-does-not-exist
    evaluate:
      type: gate
      depends_on: [review]
      evaluate:
        - condition: "{{nodes.review.output.verdict}} == 'PASS'"
          route: distill
        - condition: default
          route: distill
    distill:
      type: bash
      command: "true"
      depends_on: [evaluate]
`);

    assert.throws(
      () => loadWorkflow(wf),
      (err: Error) =>
        err instanceof WorkflowLoadError &&
        err.message.includes('this-enum-does-not-exist') &&
        err.message.includes('Known enums:'),
      'unknown enum name should be rejected with the known list surfaced'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('absent registry yaml: validation is silently skipped', () => {
  // Consumer projects that haven't synced the registry yet must continue
  // to load workflows without verdict-enum checks.
  const dir = freshTmpDir();
  try {
    // NOTE: no setupRegistry(dir) — the file is absent.
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: no registry available
  nodes:
    review:
      type: skill
      skill: null
      verdict_enum: peer-review
    evaluate:
      type: gate
      depends_on: [review]
      evaluate:
        - condition: "{{nodes.review.output.verdict}} == 'GIBBERISH'"
          route: distill
        - condition: default
          route: distill
    distill:
      type: bash
      command: "true"
      depends_on: [evaluate]
`);

    const loaded = loadWorkflow(wf);
    assert.equal(loaded.name, 'test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
