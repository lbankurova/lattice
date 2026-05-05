/**
 * Tests for the B2 fix in executor/src/nodes.ts: argv-form bash
 * execution by default, shell mode opt-in only.
 *
 * Pre-fix: every bash node ran via `execSync(command, ...)` which is
 * shell-mode. Prior-skill output substituted into the command via
 * `{{nodes.X.output.field}}` was interpreted by the shell -- a
 * malicious or malformed prior output could inject `; rm -rf $HOME`,
 * `$(whoami)`, backticks, etc.
 *
 * Post-fix: `shell: true` is the explicit opt-in; default tokenizes
 * the command into argv and runs `spawnSync(argv0, argv1+, { shell: false })`.
 * Prior outputs land as literal argv elements -- shell metacharacters
 * are inert.
 *
 * This test file exercises the fuzz cases listed in the spec
 * (`; rm -rf $HOME`, `$(whoami)`, backticks) plus the tokenizer's own
 * quoting edge cases.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { tokenizeArgv } from './nodes.js';

// ── Tokenizer correctness ───────────────────────────────────

test('tokenizeArgv: simple whitespace split', () => {
  assert.deepEqual(tokenizeArgv('echo hello world'), ['echo', 'hello', 'world']);
});

test('tokenizeArgv: single-quoted argument groups', () => {
  assert.deepEqual(
    tokenizeArgv("echo 'hello world' bye"),
    ['echo', 'hello world', 'bye'],
  );
});

test('tokenizeArgv: double-quoted argument groups', () => {
  assert.deepEqual(
    tokenizeArgv('echo "hello world" bye'),
    ['echo', 'hello world', 'bye'],
  );
});

test('tokenizeArgv: empty single-quoted token survives', () => {
  assert.deepEqual(tokenizeArgv("git stash push -m '' --"),
    ['git', 'stash', 'push', '-m', '', '--']);
});

test('tokenizeArgv: backslash escapes outside quotes', () => {
  assert.deepEqual(tokenizeArgv('echo a\\ b'), ['echo', 'a b']);
});

test('tokenizeArgv: shell metacharacters survive as literal text', () => {
  // These would be shell-meaningful in shell mode but are inert in argv.
  // The whole point of B2: a prior-skill output containing `;` or `$()`
  // arrives at the program as a literal arg.
  assert.deepEqual(
    tokenizeArgv('echo "; rm -rf /"'),
    ['echo', '; rm -rf /'],
  );
  assert.deepEqual(
    tokenizeArgv('echo "$(whoami)"'),
    ['echo', '$(whoami)'],
  );
  assert.deepEqual(
    tokenizeArgv('echo "`whoami`"'),
    ['echo', '`whoami`'],
  );
});

test('tokenizeArgv: unterminated single quote throws', () => {
  assert.throws(() => tokenizeArgv("echo 'unterminated"), /unterminated single quote/);
});

test('tokenizeArgv: unterminated double quote throws', () => {
  assert.throws(() => tokenizeArgv('echo "unterminated'), /unterminated double quote/);
});

// ── Injection-fuzz: prior-skill output as literal argv element ─

test('B2 fuzz: ; rm -rf $HOME survives as literal arg in argv mode', () => {
  // Real-world shape: a prior skill output happens to contain the
  // injection fragment, and a downstream bash node consumes it via
  // `echo {{nodes.prior.output}}`. After resolveTemplate the command
  // string is `echo ; rm -rf $HOME`. In argv mode this tokenizes to
  // ['echo', ';', 'rm', '-rf', '$HOME'] (5 args to `echo`), NOT
  // [echo + side-effect rm].
  const argv = tokenizeArgv('echo ; rm -rf $HOME');
  assert.deepEqual(argv, ['echo', ';', 'rm', '-rf', '$HOME']);
  // Critically: there is NO command separator in argv. argv[0] is `echo`,
  // and `;` is just a string argument to it. The shell would run two
  // commands; argv mode runs one program with strange args.
  assert.equal(argv[0], 'echo');
});

test('B2 fuzz: $(whoami) substring is literal in argv mode', () => {
  const argv = tokenizeArgv("git log --grep '$(whoami)'");
  assert.deepEqual(argv, ['git', 'log', '--grep', '$(whoami)']);
  // Single-quoted in original; arrives as literal arg, not subshell.
});

test('B2 fuzz: backtick command substitution is literal in argv mode', () => {
  const argv = tokenizeArgv("echo '`malicious`'");
  assert.deepEqual(argv, ['echo', '`malicious`']);
});

test('B2 fuzz: tainted prior-output containing raw quotes surfaces parse error, not silent execution', () => {
  // Realistic scenario: a prior skill output contains shell-special
  // characters AND a raw double quote; downstream consumes it as
  // `git commit -m "Topic: {{topic}}"` where the template-substituted
  // topic is `bad"; touch /tmp/pwned;#`. The raw `"` closes the outer
  // quote on the workflow author's command template.
  //
  // Pre-fix (shell mode): `replace(/"/g, '\\"')` was a hand-rolled
  // attempt to defend, but the call site didn't apply it on
  // template-substituted values -- the tainted `;` survived into the
  // shell and `touch /tmp/pwned` would execute.
  //
  // Post-fix (argv mode): the tokenizer surfaces a parse error. The
  // workflow refuses to run rather than silently execute injected
  // code. This is strictly safer than the pre-fix behavior: a noisy
  // failure is recoverable; a silent code-execution is not.
  const tainted = String.raw`bad"; touch /tmp/pwned;#`;
  assert.throws(
    () => tokenizeArgv(`git commit -m "${tainted}"`),
    /unterminated double quote/,
    'malformed command from injection should fail loudly, not execute',
  );
});

test('B2 fuzz: tainted prior-output without raw quotes lands in argv as one element, not two commands', () => {
  // Same scenario but the tainted value is wrapped in single quotes by
  // the workflow author -- a careful template would do this. Tokenizer
  // accepts the input; the metacharacter-laden string lands as ONE
  // argv element.
  const tainted = String.raw`bad; touch /tmp/pwned;#`;
  const argv = tokenizeArgv(`git commit -m '${tainted}'`);
  assert.deepEqual(argv, ['git', 'commit', '-m', 'bad; touch /tmp/pwned;#']);
  // Critically: `;` is NOT a command separator -- it's part of the
  // commit message. argv-mode spawnSync runs ONE program (`git`) with
  // four arguments. The shell would have run `git commit -m bad`
  // followed by `touch /tmp/pwned`.
  assert.equal(argv.length, 4);
});
