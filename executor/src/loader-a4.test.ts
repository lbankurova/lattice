/**
 * Tests for the A4 validate-time checks (Stream A item A4 of
 * lattice-self-fix-2026-05-05.md):
 *
 *  - Approval options must declare a `route` field (silent-stall guard).
 *  - `max_iterations` shape: positive integer when present.
 *  - Orphan-node detection emits a warning to the warn sink (not an error).
 *
 * Pre-A4, an approval option without `route` was a silent stall: the executor
 * recorded the selection and then had nowhere to go. cycle.yaml shipped the
 * "No, abort" abort option without a route for months. Documented in the
 * spec's A4 section.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow, setWarnSink, WorkflowLoadError } from './loader.js';

function freshTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'lattice-a4-test-'));
}

function writeWorkflow(dir: string, body: string): string {
  const path = join(dir, 'test-wf.yaml');
  writeFileSync(path, body);
  return path;
}

// ── Approval-route-required ─────────────────────────────────

test('A4: approval option missing route fails to load', () => {
  const dir = freshTmpDir();
  try {
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: missing-route stall
  nodes:
    start:
      type: bash
      command: "true"
    decide:
      type: approval
      depends_on: [start]
      prompt: "pick"
      options:
        - id: yes
          label: "Continue"
          route: end
        - id: no
          label: "Abort (no route — silent stall)"
    end:
      type: bash
      command: "true"
`);
    let caught: Error | null = null;
    try { loadWorkflow(wf); } catch (e) { caught = e as Error; }
    assert.ok(caught, 'expected loadWorkflow to throw on missing-route option');
    assert.ok(caught instanceof WorkflowLoadError);
    assert.match(caught!.message, /options\[id="no"\]/);
    assert.match(caught!.message, /missing required 'route'/);
    assert.match(caught!.message, /silently stall/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A4: approval option with route loads successfully', () => {
  const dir = freshTmpDir();
  try {
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: all options have routes
  nodes:
    start:
      type: bash
      command: "true"
    decide:
      type: approval
      depends_on: [start]
      prompt: "pick"
      options:
        - id: yes
          label: "Continue"
          route: end
        - id: no
          label: "Abort"
          route: terminal
    end:
      type: bash
      command: "true"
    terminal:
      type: bash
      command: "echo aborted"
`);
    // Should load without throwing.
    const loaded = loadWorkflow(wf);
    assert.equal(loaded.name, 'test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── max_iterations shape ────────────────────────────────────

test('A4: max_iterations rejected when not a positive integer', () => {
  for (const bad of [0, -1, 1.5, '3' as unknown as number]) {
    const dir = freshTmpDir();
    try {
      const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: invalid max_iterations
  nodes:
    start:
      type: bash
      command: "true"
      max_iterations: ${JSON.stringify(bad)}
`);
      let caught: Error | null = null;
      try { loadWorkflow(wf); } catch (e) { caught = e as Error; }
      assert.ok(caught, `expected throw for max_iterations=${JSON.stringify(bad)}`);
      assert.ok(caught instanceof WorkflowLoadError);
      assert.match(caught!.message, /max_iterations/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('A4: max_iterations accepts positive integers', () => {
  const dir = freshTmpDir();
  try {
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: valid max_iterations
  nodes:
    start:
      type: bash
      command: "true"
      max_iterations: 3
`);
    const loaded = loadWorkflow(wf);
    assert.equal(loaded.nodes['start'].max_iterations, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Orphan-node detection ───────────────────────────────────

test('A4: orphan node emits a warning (not an error)', () => {
  const dir = freshTmpDir();
  const warnings: string[] = [];
  const prevSink = setWarnSink((msg) => warnings.push(msg));
  try {
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: detect-from-files-style orphan
  nodes:
    start:
      type: bash
      command: "true"
    pick:
      type: gate
      depends_on: [start]
      evaluate:
        - condition: "{{state.phase}} == 'a'"
          route: handle-a
        - condition: default
          route: handle-default
    handle-a:
      type: bash
      command: "true"
    handle-default:
      type: bash
      command: "true"
    # Orphan: depends_on a gate that does NOT route to it, and nothing
    # else references it.
    fallback:
      type: bash
      depends_on: [pick]
      command: "echo fallback"
`);
    // Loads (no error); one warning fires.
    const loaded = loadWorkflow(wf);
    assert.equal(loaded.name, 'test');
    assert.ok(warnings.length === 1, `expected 1 warning, got ${warnings.length}: ${warnings.join(' | ')}`);
    assert.match(warnings[0], /orphan node/);
    assert.match(warnings[0], /fallback/);
  } finally {
    setWarnSink(prevSink);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A4: terminal node (depends_on a skill, nothing references it) is NOT orphan', () => {
  const dir = freshTmpDir();
  const warnings: string[] = [];
  const prevSink = setWarnSink((msg) => warnings.push(msg));
  try {
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: terminal node should not warn
  nodes:
    start:
      type: bash
      command: "true"
    work:
      type: bash
      depends_on: [start]
      command: "echo working"
    # Terminal: depends_on a non-gate; nothing references it. Reachable
    # because work is a bash node that completes without routing.
    finish:
      type: bash
      depends_on: [work]
      command: "echo done"
`);
    loadWorkflow(wf);
    assert.equal(warnings.length, 0, `unexpected warnings: ${warnings.join(' | ')}`);
  } finally {
    setWarnSink(prevSink);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A4: gate route to nonexistent node fails to load', () => {
  // This was already enforced pre-A4 via validateReferences; A4 keeps it.
  // Test verifies the existing behavior is preserved by the new code path.
  const dir = freshTmpDir();
  try {
    const wf = writeWorkflow(dir, `
workflow:
  name: test
  version: 1
  description: dangling gate route
  nodes:
    start:
      type: bash
      command: "true"
    pick:
      type: gate
      depends_on: [start]
      evaluate:
        - condition: default
          route: this-node-doesnt-exist
`);
    let caught: Error | null = null;
    try { loadWorkflow(wf); } catch (e) { caught = e as Error; }
    assert.ok(caught, 'expected throw on dangling gate route');
    assert.match(caught!.message, /this-node-doesnt-exist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
