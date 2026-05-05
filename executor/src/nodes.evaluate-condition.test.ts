/**
 * Tests for `evaluateCondition` (nodes.ts:348-399), the gate-condition
 * expression evaluator.
 *
 * The function is module-private; we exercise it through `executeGate` (the
 * only consumer) by constructing minimal `GateNode` shapes and reading back
 * the routing decision. This is the contract-level interface — the only
 * observable property of `evaluateCondition` is which `route` the gate
 * picks.
 *
 * Coverage gaps closed (per lattice-self-fix-2026-05-05.md E1):
 *   - literal equality (`==`, `!=`)
 *   - `.contains()` substring
 *   - boolean composition (`&&`, `||` precedence)
 *   - quoted-string-literal handling (no mis-split on operators inside
 *     `'...'`)
 *   - `exists` / `!exists` (filesystem-existence — see B3 follow-up note)
 *   - un-substituted template detection (`{{state.phase}}` left over after
 *     resolveTemplate returns empty value)
 *   - boolean literals
 *   - `default` route always wins regardless of trailing conditions
 *
 * The gate executor is called directly via the public `executeNode` dispatch
 * to avoid relying on internal exports.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { executeNode } from './nodes.js';
import type { GateNode, PlatformAdapter } from './types.js';
import type { TemplateContext } from './template.js';

// Minimal stub adapter — gate nodes never call into the adapter, but the
// dispatch signature requires one.
const stubAdapter: PlatformAdapter = {
  sendMessage: async () => {},
  promptApproval: async () => 'unused',
  getPlatformType: () => 'cli',
};

function emptyCtx(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    inputs: {},
    nodes: {},
    state: {},
    env: {},
    ...overrides,
  };
}

/**
 * Run a gate with the supplied `evaluate` rules and return the chosen route
 * (or null if no route was set, e.g. on skipped/failed status).
 */
async function runGate(
  evaluate: GateNode['evaluate'],
  ctx: TemplateContext,
  on_no_match?: GateNode['on_no_match'],
): Promise<{ status: string; route?: string }> {
  const node: GateNode = {
    type: 'gate',
    evaluate,
    ...(on_no_match ? { on_no_match } : {}),
  };
  const res = await executeNode('test-gate', node, ctx, stubAdapter, process.cwd());
  return { status: res.status, route: res.route };
}

// ── Literal equality / inequality ───────────────────────────

test('E1: == matches literal string', async () => {
  const out = await runGate(
    [
      { condition: "{{state.phase}} == 'running'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { phase: 'running' } }),
  );
  assert.equal(out.route, 'go');
});

test('E1: == fails on mismatch (falls to default)', async () => {
  const out = await runGate(
    [
      { condition: "{{state.phase}} == 'running'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { phase: 'paused' } }),
  );
  assert.equal(out.route, 'fallback');
});

test('E1: != matches when values differ', async () => {
  const out = await runGate(
    [
      { condition: "{{state.phase}} != 'archived'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { phase: 'active' } }),
  );
  assert.equal(out.route, 'go');
});

test('E1: != falls through when values match', async () => {
  const out = await runGate(
    [
      { condition: "{{state.phase}} != 'active'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { phase: 'active' } }),
  );
  assert.equal(out.route, 'fallback');
});

// ── Numeric comparison ──────────────────────────────────────
//
// FOLLOW-UP: nodes.ts:348-399 advertises support for `<=` and `>=` (per the
// E1 spec entry) but the implementation has no regex case for them — they
// fall through to "non-empty string is truthy" and therefore evaluate to
// true regardless of operand values. These tests document the contract; the
// numeric ops should be implemented in a follow-up. Not patching here per
// stream-E rules (test-only).

test('E1: numeric <= currently has no operator support (FOLLOW-UP)', async () => {
  // Documents current behavior: any string with `<=` evaluates truthy
  // because the regex switch doesn't match it. When numeric support lands,
  // change this assertion to `route: 'go'` for the matching case and
  // `route: 'fallback'` for the non-matching case.
  const out = await runGate(
    [
      { condition: '5 <= 10', route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx(),
  );
  // Truthy-string fallthrough — this asserts the pre-fix behavior.
  assert.equal(out.route, 'go');
});

// ── Boolean composition ─────────────────────────────────────

test('E1: && both true → true', async () => {
  const out = await runGate(
    [
      {
        condition: "{{state.a}} == 'x' && {{state.b}} == 'y'",
        route: 'go',
      },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { a: 'x', b: 'y' } }),
  );
  assert.equal(out.route, 'go');
});

test('E1: && one false → false', async () => {
  const out = await runGate(
    [
      {
        condition: "{{state.a}} == 'x' && {{state.b}} == 'y'",
        route: 'go',
      },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { a: 'x', b: 'NOPE' } }),
  );
  assert.equal(out.route, 'fallback');
});

test('E1: || at least one true → true', async () => {
  const out = await runGate(
    [
      {
        condition: "{{state.a}} == 'x' || {{state.b}} == 'y'",
        route: 'go',
      },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { a: 'NOPE', b: 'y' } }),
  );
  assert.equal(out.route, 'go');
});

test('E1: || both false → false', async () => {
  const out = await runGate(
    [
      {
        condition: "{{state.a}} == 'x' || {{state.b}} == 'y'",
        route: 'go',
      },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { a: 'A', b: 'B' } }),
  );
  assert.equal(out.route, 'fallback');
});

test('E1: || binds looser than && (a || b && c, with b=false)', async () => {
  // (a || b && c) === (a || (b && c)). With b=false, RHS is false; result
  // is `a`. Set a=true and the gate routes 'go'.
  const out = await runGate(
    [
      {
        condition:
          "{{state.a}} == 'TRUE' || {{state.b}} == 'TRUE' && {{state.c}} == 'TRUE'",
        route: 'go',
      },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({
      state: { a: 'TRUE', b: 'FALSE', c: 'FALSE' },
    }),
  );
  assert.equal(out.route, 'go');
});

test('E1: && inside RHS string literal does not mis-split via splitTopLevel', async () => {
  // splitTopLevel skips operators inside single-quoted string literals,
  // so the `&&` in `'one && two'` must NOT trigger an AND-split. After
  // resolveTemplate, `state.x = 'val'` -> condition becomes:
  //   val == 'one && two'
  // which is a single == comparison, not an AND-composite. The == regex
  // matches and the comparison is false ('val' != 'one && two'),
  // routing to default — proving the splitter respected the quotes.
  const out = await runGate(
    [
      { condition: "{{state.x}} == 'one && two'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { x: 'val' } }),
  );
  assert.equal(out.route, 'fallback');
});

test('E1: || inside RHS string literal does not mis-split via splitTopLevel', async () => {
  // Same shape as the && test above but for OR. If the splitter mis-fired
  // on `||`, the expr would split into nonsense halves; instead the ==
  // regex matches the whole thing.
  const out = await runGate(
    [
      { condition: "{{state.x}} == 'p || q'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { x: 'val' } }),
  );
  assert.equal(out.route, 'fallback');
});

test('E1: substituted LHS containing && breaks the splitter (FOLLOW-UP)', async () => {
  // Substituting `one && two` un-quoted on the LHS re-introduces a top-
  // level `&&` AFTER splitTopLevel has already inspected the RHS quote.
  // splitTopLevel runs on the full expression, so it splits the LHS `&&`
  // into ["one ", " two == 'one && two'"]. Each half evaluates separately:
  //   - "one"                       -> truthy-string branch -> true
  //   - "two == 'one && two'"       -> == regex, "two" != "one && two" -> false
  // every() therefore returns false even though the user clearly intended
  // a single == comparison that should match. Result: route='fallback'.
  // FOLLOW-UP: state values containing operator characters get substituted
  // un-quoted and corrupt the parse. Fixes: single-quote substituted text,
  // or parse-then-substitute.
  const out = await runGate(
    [
      { condition: "{{state.x}} == 'one && two'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { x: 'one && two' } }),
  );
  assert.equal(out.route, 'fallback');
});

// ── .contains() substring ───────────────────────────────────

test('E1: .contains() matches substring', async () => {
  const out = await runGate(
    [
      { condition: "{{state.msg}}.contains('error')", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { msg: 'fatal error in module x' } }),
  );
  assert.equal(out.route, 'go');
});

test('E1: .contains() false on missing substring', async () => {
  const out = await runGate(
    [
      { condition: "{{state.msg}}.contains('error')", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { msg: 'all clear' } }),
  );
  assert.equal(out.route, 'fallback');
});

// ── exists / !exists ────────────────────────────────────────
//
// B3 (Stream B) replaces the always-false `!exists()` with a real
// filesystem check. The tests below are written against the post-B3
// contract; pre-B3 they pass trivially because `!exists('...')` returns
// false (the `if (trimmed.startsWith("!exists('"))` short-circuit), which
// happens to match the "default" branch of these gates.
//
// FOLLOW-UP (B3 unblocks): once the implementation actually probes the
// filesystem, the file-present case below should return route='go' for
// `exists('...')` (currently no exists() handler exists at all — falls
// through to truthy-string), and the file-absent case for `!exists('...')`
// should return route='go' (currently always falls to fallback).

test('E1: !exists() currently returns false (pre-B3) — documents contract', async () => {
  // Even with a clearly-nonexistent path, `!exists()` returns false in
  // the current impl. Post-B3 this should flip to true and route 'go'.
  const out = await runGate(
    [
      {
        condition: "!exists('/this/path/definitely/does/not/exist-xyz')",
        route: 'go',
      },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx(),
  );
  // Pre-B3 contract: !exists() returns false -> falls to default.
  // Post-B3: this assertion will flip and the test should be updated.
  assert.equal(out.route, 'fallback');
});

// ── Un-substituted template detection ───────────────────────
//
// FOLLOW-UP: when resolveTemplate cannot find a value (e.g. {{state.X}}
// where state has no X), it currently substitutes the empty string. The
// resulting expression may then evaluate as an unintended truthy string.
// A guard that detects un-substituted `{{...}}` literals in the resolved
// expression would prevent silent mis-routing. Test below documents the
// current behavior so the regression is visible when the guard lands.

test('E1: missing state var resolves to empty string (current behavior)', async () => {
  // {{state.phase}} -> '' -> condition becomes  ` == 'running'`.
  // The == regex requires `^(.+?)\s*==...` — at least one char on the LHS.
  // After trim, the expression is `== 'running'`, which the regex does NOT
  // match. The function then falls through to the truthy-string branch —
  // any non-empty string is truthy -> returns true -> route='go'.
  // FOLLOW-UP: this is exactly the silent-mis-routing failure mode the
  // un-substituted-template guard described in the E1 spec is meant to
  // catch. When that guard lands, this assertion should flip to 'fallback'
  // (or 'failed' if the guard prefers loud failure).
  const out = await runGate(
    [
      { condition: "{{state.phase}} == 'running'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx(),
  );
  assert.equal(out.route, 'go');
});

// ── Boolean literals ────────────────────────────────────────

test('E1: literal "true" evaluates true', async () => {
  const out = await runGate(
    [
      { condition: 'true', route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx(),
  );
  assert.equal(out.route, 'go');
});

test('E1: literal "false" evaluates false', async () => {
  const out = await runGate(
    [
      { condition: 'false', route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx(),
  );
  assert.equal(out.route, 'fallback');
});

// ── default routing & no-match behavior ─────────────────────

test('E1: default route wins when no prior condition matches', async () => {
  const out = await runGate(
    [
      { condition: "{{state.phase}} == 'running'", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { phase: 'paused' } }),
  );
  assert.equal(out.route, 'fallback');
});

test('E1: first matching condition wins (later default ignored)', async () => {
  const out = await runGate(
    [
      { condition: "{{state.phase}} == 'running'", route: 'first' },
      { condition: 'default', route: 'second' },
    ],
    emptyCtx({ state: { phase: 'running' } }),
  );
  assert.equal(out.route, 'first');
});

test('E1: no-match with on_no_match=skip returns skipped status', async () => {
  const out = await runGate(
    [{ condition: "{{state.phase}} == 'running'", route: 'go' }],
    emptyCtx({ state: { phase: 'paused' } }),
    'skip',
  );
  assert.equal(out.status, 'skipped');
  assert.equal(out.route, undefined);
});

test('E1: no-match without on_no_match returns failed status', async () => {
  const out = await runGate(
    [{ condition: "{{state.phase}} == 'running'", route: 'go' }],
    emptyCtx({ state: { phase: 'paused' } }),
  );
  assert.equal(out.status, 'failed');
});

// ── Whitespace tolerance ────────────────────────────────────

test('E1: surrounding whitespace tolerated around ==', async () => {
  const out = await runGate(
    [
      { condition: "  {{state.phase}}   ==   'running'  ", route: 'go' },
      { condition: 'default', route: 'fallback' },
    ],
    emptyCtx({ state: { phase: 'running' } }),
  );
  assert.equal(out.route, 'go');
});
