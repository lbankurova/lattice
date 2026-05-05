/**
 * Tests for the A4 max_iterations enforcement (engine-side).
 *
 * Stream A item A4 of lattice-self-fix-2026-05-05.md. Pre-A4, the route-target
 * dispatch loop silently skipped re-entry: `if (run.nodeResults[targetId])
 * continue;`. That hid back-routes (research-cycle accept-r2 → incorporate-r1,
 * blueprint-cycle approval → synthesize, bug-fix-cycle revise → fix) — the
 * YAML expressed loop intent that the executor refused to honor.
 *
 * Post-A4: nodes opt in via `max_iterations: N`. The executor permits N total
 * entries; the (N+1)-th attempt throws with a clear, actionable message.
 * Pre-A4 silent-skip is preserved when max_iterations is unset (back-compat
 * for workflows that route to already-executed parentless targets without
 * intending a loop).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkVisitLimit } from './engine.js';

test('A4 visit-limit: allow first entry when count is 0', () => {
  const counts: Record<string, number> = {};
  const decision = checkVisitLimit(counts, 'foo', 3);
  assert.equal(decision.allow, true);
  assert.equal(decision.throwReason, undefined);
});

test('A4 visit-limit: allow until limit reached', () => {
  const counts: Record<string, number> = { foo: 2 };
  const decision = checkVisitLimit(counts, 'foo', 3);
  assert.equal(decision.allow, true, 'visited=2, limit=3 should still allow');
});

test('A4 visit-limit: explicit limit reached → block with throwReason', () => {
  const counts: Record<string, number> = { foo: 3 };
  const decision = checkVisitLimit(counts, 'foo', 3);
  assert.equal(decision.allow, false);
  assert.ok(decision.throwReason, 'expected throwReason to be set on explicit-limit reach');
  assert.match(decision.throwReason!, /max_iterations=3/);
  assert.match(decision.throwReason!, /4-th time/);
});

test('A4 visit-limit: explicit limit exceeded (defensive guard)', () => {
  const counts: Record<string, number> = { foo: 5 };
  const decision = checkVisitLimit(counts, 'foo', 3);
  assert.equal(decision.allow, false);
  assert.ok(decision.throwReason);
  assert.match(decision.throwReason!, /exceeded max_iterations=3/);
  assert.match(decision.throwReason!, /visited=5/);
});

test('A4 visit-limit: implicit default (max_iterations unset) silent-skips on re-entry', () => {
  const counts: Record<string, number> = { foo: 1 };
  const decision = checkVisitLimit(counts, 'foo', undefined);
  assert.equal(decision.allow, false, 'default limit is 1; visited=1 means already entered');
  assert.equal(decision.throwReason, undefined, 'silent skip preserves pre-A4 back-compat');
});

test('A4 visit-limit: max_iterations=1 explicit behaves like throw on re-entry', () => {
  const counts: Record<string, number> = { foo: 1 };
  const decision = checkVisitLimit(counts, 'foo', 1);
  assert.equal(decision.allow, false);
  assert.ok(decision.throwReason, 'explicit max_iterations=1 + re-entry attempt = throw');
  assert.match(decision.throwReason!, /max_iterations=1/);
});

test('A4 visit-limit: distinguishes implicit vs explicit (1 == 1) by intent', () => {
  // Author writes `max_iterations: 1`: opt-in counter, throw on re-entry.
  // Author omits the field: implicit 1, silent skip on re-entry (back-compat).
  // Same numeric limit; different semantics.
  const counts: Record<string, number> = { foo: 1 };
  const explicit = checkVisitLimit(counts, 'foo', 1);
  const implicit = checkVisitLimit(counts, 'foo', undefined);
  assert.equal(explicit.allow, false);
  assert.ok(explicit.throwReason);
  assert.equal(implicit.allow, false);
  assert.equal(implicit.throwReason, undefined);
});
