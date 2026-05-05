/**
 * Tests for `parseClaudeJsonOutput` (nodes.ts:473-526).
 *
 * The function was made into a named export specifically to support these
 * tests — the comment block on the export marks it `@internal` and explains
 * the testing rationale. No behavioral change in the function itself.
 *
 * Coverage gaps closed (per lattice-self-fix-2026-05-05.md E2):
 *   - well-formed JSON with `result` text only (no cost telemetry)
 *   - is_error: true (must throw)
 *   - is_error: true with empty/missing result message (placeholder text)
 *   - malformed JSON that looks innocent -> returned verbatim as text
 *   - malformed JSON that looks like a CLI error -> throws (looksLikeErrorOutput)
 *   - completely empty stdout -> empty text
 *   - error-shaped text inside non-error JSON -> passes through (no false-positive throw)
 *   - cost telemetry: full usage block + cost_usd
 *   - cost telemetry: total_cost_usd fallback when cost_usd absent
 *   - cost telemetry: cost_usd takes precedence when both present
 *   - cost telemetry: usage present but cost_usd zero (still emits cost)
 *   - cost telemetry: missing usage AND zero cost_usd -> no cost field
 *   - cost telemetry: partial usage (only input_tokens) -> defaults
 *   - cost telemetry: missing duration_ms / model defaults
 *   - cache token fields propagated
 *   - JSON `result` whitespace trimmed
 *
 * Each fixture is a literal JSON string passed directly to the function.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseClaudeJsonOutput } from './nodes.js';

// ── Well-formed success ─────────────────────────────────────

test('E2: well-formed JSON with result text returns text + no cost', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({ result: 'hello from claude' }));
  assert.equal(out.text, 'hello from claude');
  assert.equal(out.cost, undefined);
});

test('E2: trims whitespace from result field', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({ result: '  spaced text  \n' }));
  assert.equal(out.text, 'spaced text');
});

test('E2: missing result field returns empty text', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({ usage: { input_tokens: 1 } }));
  assert.equal(out.text, '');
});

// ── is_error fan-in ─────────────────────────────────────────

test('E2: is_error=true throws with detail message', () => {
  assert.throws(
    () => parseClaudeJsonOutput(JSON.stringify({ is_error: true, result: 'auth failed' })),
    /is_error=true.*auth failed/,
  );
});

test('E2: is_error=true with no result uses placeholder', () => {
  assert.throws(
    () => parseClaudeJsonOutput(JSON.stringify({ is_error: true })),
    /is_error=true with no result message/,
  );
});

test('E2: is_error=true with whitespace-only result uses placeholder', () => {
  assert.throws(
    () => parseClaudeJsonOutput(JSON.stringify({ is_error: true, result: '   ' })),
    /is_error=true with no result message/,
  );
});

test('E2: is_error=true throws — long detail truncated to 500 chars', () => {
  const longText = 'x'.repeat(2000);
  let caught: Error | null = null;
  try {
    parseClaudeJsonOutput(JSON.stringify({ is_error: true, result: longText }));
  } catch (e) {
    caught = e as Error;
  }
  assert.ok(caught, 'expected throw');
  // Prefix "Claude CLI reported is_error=true: " is ~38 chars.
  // Detail is sliced to 500 chars, so total message is around 538.
  assert.ok(caught!.message.length <= 600, `message too long: ${caught!.message.length}`);
  assert.ok(caught!.message.length >= 500, `message too short: ${caught!.message.length}`);
});

// ── Non-JSON fallback ───────────────────────────────────────

test('E2: bare plain-text without error-words returns as text', () => {
  const out = parseClaudeJsonOutput('Just a friendly message from a tool.');
  assert.equal(out.text, 'Just a friendly message from a tool.');
  assert.equal(out.cost, undefined);
});

test('E2: bare plain-text with "error" throws (CLI failure heuristic)', () => {
  assert.throws(
    () => parseClaudeJsonOutput('Authentication error: API key expired.'),
    /non-JSON error output/,
  );
});

test('E2: bare plain-text with "rate limit" throws', () => {
  assert.throws(
    () => parseClaudeJsonOutput('You have been rate limited.'),
    /non-JSON error output/,
  );
});

test('E2: bare plain-text with "unauthorized" throws', () => {
  assert.throws(
    () => parseClaudeJsonOutput('unauthorized: invalid bearer token'),
    /non-JSON error output/,
  );
});

test('E2: bare plain-text with "ECONNREFUSED" throws', () => {
  assert.throws(
    () => parseClaudeJsonOutput('Connect ECONNREFUSED 127.0.0.1:443'),
    /non-JSON error output/,
  );
});

test('E2: bare plain-text with "out of memory" throws', () => {
  assert.throws(
    () => parseClaudeJsonOutput('Process killed: out of memory'),
    /non-JSON error output/,
  );
});

test('E2: heuristic is case-insensitive', () => {
  // "ERROR" upper-cased should still match.
  assert.throws(
    () => parseClaudeJsonOutput('FATAL ERROR: cannot continue'),
    /non-JSON error output/,
  );
});

test('E2: long non-JSON error truncated to 500 chars in throw', () => {
  let caught: Error | null = null;
  try {
    parseClaudeJsonOutput('error: ' + 'x'.repeat(2000));
  } catch (e) {
    caught = e as Error;
  }
  assert.ok(caught);
  assert.ok(caught!.message.length <= 600);
});

// ── Empty stdout ────────────────────────────────────────────

test('E2: empty stdout returns empty text (not an error)', () => {
  const out = parseClaudeJsonOutput('');
  assert.equal(out.text, '');
  assert.equal(out.cost, undefined);
});

test('E2: whitespace-only stdout returns empty text', () => {
  const out = parseClaudeJsonOutput('   \n\t \n');
  assert.equal(out.text, '');
  assert.equal(out.cost, undefined);
});

// ── Error-shaped text inside non-error JSON ─────────────────

test('E2: JSON result with "error" text passes through (no false-positive)', () => {
  // The looksLikeErrorOutput heuristic only fires on non-JSON fallback.
  // Once JSON parses, is_error governs — a result string can mention "error"
  // without throwing.
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'Error analysis complete. No error conditions detected.',
  }));
  assert.match(out.text, /Error analysis complete/);
});

test('E2: JSON result with "rate limit" text passes through', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'Discussed rate limits in section 3.',
  }));
  assert.match(out.text, /rate limits/);
});

// ── Cost telemetry ──────────────────────────────────────────

test('E2: full usage block + cost_usd produces cost field', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    usage: {
      input_tokens: 1234,
      output_tokens: 567,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 200,
    },
    cost_usd: 0.0123,
    duration_ms: 4500,
    model: 'claude-opus-4-7',
  }));
  assert.ok(out.cost, 'cost field expected');
  assert.equal(out.cost!.usage.inputTokens, 1234);
  assert.equal(out.cost!.usage.outputTokens, 567);
  assert.equal(out.cost!.usage.cacheCreationTokens, 100);
  assert.equal(out.cost!.usage.cacheReadTokens, 200);
  assert.equal(out.cost!.costUSD, 0.0123);
  assert.equal(out.cost!.durationMs, 4500);
  assert.equal(out.cost!.model, 'claude-opus-4-7');
});

test('E2: total_cost_usd is used when cost_usd absent', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    usage: { input_tokens: 10, output_tokens: 5 },
    total_cost_usd: 0.0001,
  }));
  assert.ok(out.cost);
  assert.equal(out.cost!.costUSD, 0.0001);
});

test('E2: cost_usd takes precedence over total_cost_usd', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    usage: { input_tokens: 10, output_tokens: 5 },
    cost_usd: 0.05,
    total_cost_usd: 0.99,
  }));
  assert.equal(out.cost!.costUSD, 0.05);
});

test('E2: usage present without cost_usd still emits cost field', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    usage: { input_tokens: 10, output_tokens: 5 },
  }));
  assert.ok(out.cost, 'cost expected when usage is present');
  assert.equal(out.cost!.costUSD, 0);
  assert.equal(out.cost!.usage.inputTokens, 10);
});

test('E2: missing usage and zero cost_usd -> no cost field', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({ result: 'ok', cost_usd: 0 }));
  assert.equal(out.cost, undefined);
});

test('E2: partial usage (only input_tokens) defaults missing fields', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    usage: { input_tokens: 42 },
    cost_usd: 0.001,
  }));
  assert.ok(out.cost);
  assert.equal(out.cost!.usage.inputTokens, 42);
  assert.equal(out.cost!.usage.outputTokens, 0);
  // Missing cache fields stay undefined (not coerced to 0).
  assert.equal(out.cost!.usage.cacheCreationTokens, undefined);
  assert.equal(out.cost!.usage.cacheReadTokens, undefined);
});

test('E2: missing duration_ms defaults to 0', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    usage: { input_tokens: 10, output_tokens: 5 },
    cost_usd: 0.001,
  }));
  assert.equal(out.cost!.durationMs, 0);
});

test('E2: missing model leaves cost.model undefined', () => {
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    usage: { input_tokens: 10, output_tokens: 5 },
    cost_usd: 0.001,
  }));
  assert.equal(out.cost!.model, undefined);
});

test('E2: non-cost telemetry fields ignored gracefully', () => {
  // Forward-compat: extra fields the parser doesn't know should pass.
  const out = parseClaudeJsonOutput(JSON.stringify({
    result: 'ok',
    future_field: 'value',
    nested: { unknown: true },
  }));
  assert.equal(out.text, 'ok');
});
