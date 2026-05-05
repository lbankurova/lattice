/**
 * Node executors — dispatch logic for each node type.
 *
 * Phase 1 (CLI): bash = child_process, skill = claude CLI, approval = terminal prompt.
 * Phase 2 (Slack): approval = Slack thread prompt.
 * Phase 3 (Headless): skill = Claude API direct call.
 */

import { execSync, spawnSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type {
  WorkflowNode, BashNode, SkillNode, GateNode, ApprovalNode, ParallelNode,
  NodeResult, NodeCost, PlatformAdapter, TriggerRule,
} from './types.js';
import type { TemplateContext } from './template.js';
import { resolveTemplate, resolveTemplates } from './template.js';

/**
 * Execute a single node and return its result.
 */
export async function executeNode(
  nodeId: string,
  node: WorkflowNode,
  ctx: TemplateContext,
  adapter: PlatformAdapter,
  cwd: string,
): Promise<NodeResult> {
  const startedAt = new Date().toISOString();

  try {
    switch (node.type) {
      case 'bash':
        return await executeBash(nodeId, node, ctx, cwd, startedAt);
      case 'skill':
        return await executeSkill(nodeId, node, ctx, cwd, adapter, startedAt);
      case 'gate':
        return executeGate(nodeId, node, ctx, cwd, startedAt);
      case 'approval':
        return await executeApproval(nodeId, node, ctx, adapter, startedAt);
      case 'parallel':
        // Parallel nodes are handled by the engine, not here
        throw new Error(`Parallel nodes are dispatched by the engine, not executeNode`);
      default:
        throw new Error(`Unknown node type: ${(node as WorkflowNode).type}`);
    }
  } catch (err) {
    return {
      nodeId,
      status: 'failed',
      output: '',
      startedAt,
      completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Bash executor ───────────────────────────────────────────

/**
 * Tokenize a command string into argv form using POSIX-style shell
 * quoting:
 *   - whitespace separates tokens
 *   - single quotes group verbatim (no escape inside)
 *   - double quotes group with backslash-escape for `\` and `"`
 *   - bare backslash escapes the next character outside quotes
 *
 * Shell metacharacters (`|`, `>`, `<`, `;`, `&&`, `$VAR`, `$(...)`,
 * backticks) are NOT interpreted -- they survive into argv as-is. That
 * is the entire point of argv mode: prior-skill output substituted
 * into a command lands as a literal argv element, not as code.
 *
 * If a workflow needs shell features, set `shell: true` on the node.
 *
 * Throws on unterminated quote / dangling backslash.
 */
export function tokenizeArgv(command: string): string[] {
  const argv: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;
  let started = false; // distinguish empty token vs no-token

  while (i < command.length) {
    const ch = command[i];

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
        i++;
        continue;
      }
      cur += ch;
      started = true;
      i++;
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
        i++;
        continue;
      }
      if (ch === '\\' && i + 1 < command.length) {
        const next = command[i + 1];
        // In double quotes, only `\\`, `\"`, and `\$` (we don't expand
        // $VAR here so `\$` just yields `$`) and `\\` itself escape;
        // others pass through with the backslash retained.
        if (next === '\\' || next === '"' || next === '$' || next === '`') {
          cur += next;
          i += 2;
          continue;
        }
        cur += ch;
        i++;
        continue;
      }
      cur += ch;
      started = true;
      i++;
      continue;
    }

    // Outside any quotes
    if (ch === "'") {
      inSingle = true;
      started = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      started = true;
      i++;
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      cur += command[i + 1];
      started = true;
      i += 2;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        argv.push(cur);
        cur = '';
        started = false;
      }
      i++;
      continue;
    }
    cur += ch;
    started = true;
    i++;
  }

  if (inSingle || inDouble) {
    throw new Error(`tokenizeArgv: unterminated ${inSingle ? 'single' : 'double'} quote in: ${command}`);
  }
  if (started) argv.push(cur);
  return argv;
}

async function executeBash(
  nodeId: string,
  node: BashNode,
  ctx: TemplateContext,
  cwd: string,
  startedAt: string,
): Promise<NodeResult> {
  const command = resolveTemplate(node.command, ctx);
  const timeout = node.timeout ?? 120_000;

  // B2 fix: default to argv-mode (no shell). `shell: true` is the
  // explicit opt-in for nodes that need pipes / redirects / && / etc.
  // See BashNode.shell docstring for the security rationale -- the
  // short version: prior-skill output via {{nodes.X.output.field}}
  // is shell-injectable in shell mode but inert as an argv element.
  const useShell = node.shell === true;

  try {
    let stdout: string;
    if (useShell) {
      // Legacy shell path -- /bin/sh -c on POSIX, cmd.exe on Win32.
      // Workflows that opt in must be aware of cross-platform quoting
      // differences and the injection surface for prior-skill output.
      const opts: ExecSyncOptionsWithStringEncoding = {
        cwd,
        encoding: 'utf-8',
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      };
      stdout = execSync(command, opts);
    } else {
      // Argv path. Tokenize, then spawn directly. spawnSync without
      // `shell: true` does NOT invoke a shell; argv0 is the program,
      // argv1+ are literal arguments (no globbing, no expansion, no
      // metacharacter interpretation).
      const argv = tokenizeArgv(command);
      if (argv.length === 0) {
        throw new Error(`Empty command after tokenization: ${command}`);
      }
      const result = spawnSync(argv[0], argv.slice(1), {
        cwd,
        encoding: 'utf-8',
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        // `shell: false` is the default but make it explicit for
        // future readers; this is the entire point of B2.
        shell: false,
      });
      // spawnSync surfaces errors via `error` (e.g., ENOENT) AND via
      // non-zero `status`. Match execSync's throw-on-nonzero contract
      // so the existing catch-block logic upstream handles both modes
      // identically.
      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        const err = new Error(
          `Command failed: ${argv[0]}${argv.length > 1 ? ' ' + argv.slice(1).join(' ') : ''}`,
        );
        (err as Error & { status: number; stdout: string; stderr: string }).status = result.status ?? 1;
        (err as Error & { status: number; stdout: string; stderr: string }).stdout = result.stdout ?? '';
        (err as Error & { status: number; stdout: string; stderr: string }).stderr = result.stderr ?? '';
        throw err;
      }
      stdout = result.stdout ?? '';
    }
    return {
      nodeId,
      status: 'completed',
      output: stdout.trim(),
      exitCode: 0,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    const output = (execErr.stdout ?? '') + (execErr.stderr ?? '');

    if (node.on_failure === 'continue' || node.on_failure === 'skip') {
      return {
        nodeId,
        status: node.on_failure === 'skip' ? 'skipped' : 'completed',
        output: output.trim(),
        exitCode: execErr.status ?? 1,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    return {
      nodeId,
      status: 'failed',
      output: output.trim(),
      exitCode: execErr.status ?? 1,
      startedAt,
      completedAt: new Date().toISOString(),
      error: execErr.message ?? 'Command failed',
    };
  }
}

// ── Skill executor ──────────────────────────────────────────

async function executeSkill(
  nodeId: string,
  node: SkillNode,
  ctx: TemplateContext,
  cwd: string,
  adapter: PlatformAdapter,
  startedAt: string,
): Promise<NodeResult> {
  const resolved = resolveTemplates(node, ctx) as SkillNode;

  // Build the prompt for Claude
  let prompt = '';

  if (resolved.skill) {
    prompt += `Run /lattice:${resolved.skill.replace('lattice/', '').replace('ops/', 'ops:')}`;
    if (resolved.inputs) {
      const inputParts = Object.entries(resolved.inputs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      prompt += ` ${inputParts}`;
    }
    prompt += '\n\n';
  }

  if (resolved.prompt_append) {
    prompt += resolved.prompt_append;
  }

  if (!prompt.trim()) {
    return {
      nodeId,
      status: 'failed',
      output: '',
      startedAt,
      completedAt: new Date().toISOString(),
      error: 'Skill node has no skill reference and no prompt_append',
    };
  }

  // Phase 1: invoke Claude Code CLI with JSON output for token tracking
  // Phase 2+: will use Claude API directly
  const context = resolved.context ?? 'inherit';

  await adapter.sendMessage(`[${nodeId}] Executing skill: ${resolved.skill ?? 'inline prompt'}`);

  try {
    const cliArgs = [
      '--print',
      '--output-format', 'json',
    ];

    if (context === 'fresh') {
      cliArgs.push('--no-context');
    }

    cliArgs.push(prompt);

    // spawnSync argv-form (shell: false) — prompt passed as a single argv
    // element so newlines / quotes / dollars / backslashes round-trip
    // unchanged on POSIX and Windows alike. Avoids the bash-only $'...'
    // quoting that previously corrupted prompts on Windows.
    const result = spawnSync('claude', cliArgs, {
      cwd,
      encoding: 'utf-8',
      timeout: 600_000, // 10 min for skill execution
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: false,
    });

    if (result.error) throw result.error;
    if (typeof result.status === 'number' && result.status !== 0) {
      const execLikeErr: { status: number; stdout: string; stderr: string; message: string } = {
        status: result.status,
        stdout: (result.stdout ?? '').toString(),
        stderr: (result.stderr ?? '').toString(),
        message: `claude exited with status ${result.status}`,
      };
      throw execLikeErr;
    }

    const stdout = (result.stdout ?? '').toString();
    const { text, cost } = parseClaudeJsonOutput(stdout);

    return {
      nodeId,
      status: 'completed',
      output: text,
      cost,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };

    // Try to extract cost even from failed runs (partial output)
    let cost: NodeCost | undefined;
    if (execErr.stdout) {
      try {
        ({ cost } = parseClaudeJsonOutput(execErr.stdout));
      } catch { /* no usable JSON */ }
    }

    return {
      nodeId,
      status: 'failed',
      output: (execErr.stdout ?? '').trim(),
      cost,
      startedAt,
      completedAt: new Date().toISOString(),
      error: execErr.message ?? 'Skill execution failed',
    };
  }
}

// ── Gate executor ───────────────────────────────────────────

function executeGate(
  nodeId: string,
  node: GateNode,
  ctx: TemplateContext,
  cwd: string,
  startedAt: string,
): NodeResult {
  for (const cond of node.evaluate) {
    if (cond.condition === 'default') {
      return {
        nodeId,
        status: 'completed',
        output: `Route: ${cond.route}`,
        route: cond.route,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    const resolved = resolveTemplate(cond.condition, ctx);
    if (evaluateCondition(resolved, cwd)) {
      return {
        nodeId,
        status: 'completed',
        output: `Condition matched: ${cond.condition} -> ${cond.route}`,
        route: cond.route,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  }

  // No match
  if (node.on_no_match === 'skip') {
    return {
      nodeId,
      status: 'skipped',
      output: 'No condition matched, skipped',
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  return {
    nodeId,
    status: 'failed',
    output: 'No condition matched',
    startedAt,
    completedAt: new Date().toISOString(),
    error: 'Gate: no condition matched and on_no_match is not "skip"',
  };
}

// ── Approval executor ───────────────────────────────────────

async function executeApproval(
  nodeId: string,
  node: ApprovalNode,
  ctx: TemplateContext,
  adapter: PlatformAdapter,
  startedAt: string,
): Promise<NodeResult> {
  const prompt = resolveTemplate(node.prompt, ctx);
  const options = resolveTemplates(node.options, ctx);

  const selectedId = await adapter.promptApproval(prompt, options);

  const selected = options.find(o => o.id === selectedId);

  return {
    nodeId,
    status: 'completed',
    output: `Selected: ${selectedId}`,
    selectedOption: selectedId,
    route: selected?.route,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// ── Condition evaluator ─────────────────────────────────────

/**
 * Split `expr` on `delim` (a 2-char operator like `&&` or `||`), but only at
 * top level — occurrences inside single-quoted string literals are ignored.
 * Returns the original string as a single-element array if no top-level
 * occurrence is found.
 */
function splitTopLevel(expr: string, delim: string): string[] {
  const parts: string[] = [];
  let inString = false;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'") {
      inString = !inString;
      continue;
    }
    if (!inString && expr.startsWith(delim, i)) {
      parts.push(expr.slice(start, i));
      i += delim.length - 1;
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

/**
 * Evaluate a simple condition expression.
 * Supports: ==, !=, contains(), !exists, exists, &&, ||, true, false.
 *
 * Precedence: || binds looser than && (standard). Splits respect single-
 * quoted string literals so `inputs.x == 'a && b'` is not mis-split at the
 * `&&` inside the literal.
 *
 * `cwd` is required for `exists(...)` / `!exists(...)` filesystem checks.
 * Paths in the literal are resolved relative to cwd. The pre-fix version
 * unconditionally returned `false` for `!exists(...)` (with the comment
 * "Would need filesystem check") and fell through to the truthy-string
 * branch for `exists(...)` -- both produced silently wrong gate routing
 * for any workflow that depended on the predicate.
 */
export function evaluateCondition(expr: string, cwd: string = process.cwd()): boolean {
  const trimmed = expr.trim();

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // || has lower precedence — split first so `a || b && c` parses as `a || (b && c)`.
  // Splits ignore occurrences inside single-quoted string literals.
  const orParts = splitTopLevel(trimmed, '||');
  if (orParts.length > 1) {
    return orParts.some(part => evaluateCondition(part, cwd));
  }

  // && has higher precedence than ||.
  const andParts = splitTopLevel(trimmed, '&&');
  if (andParts.length > 1) {
    return andParts.every(part => evaluateCondition(part, cwd));
  }

  // == comparison
  const eqMatch = trimmed.match(/^(.+?)\s*==\s*'([^']*)'$/);
  if (eqMatch) {
    return eqMatch[1].trim() === eqMatch[2];
  }

  // != comparison
  const neqMatch = trimmed.match(/^(.+?)\s*!=\s*'([^']*)'$/);
  if (neqMatch) {
    return neqMatch[1].trim() !== neqMatch[2];
  }

  // .contains()
  const containsMatch = trimmed.match(/^(.+?)\.contains\('([^']*)'\)$/);
  if (containsMatch) {
    return containsMatch[1].trim().includes(containsMatch[2]);
  }

  // !exists('path') -- B3 fix. Pre-fix returned false unconditionally.
  // Now performs a real fs.existsSync check against `path` resolved
  // relative to cwd. Absolute paths pass through unchanged. Template
  // substitution happens upstream in resolveTemplate, so by the time
  // we land here the literal is already concrete.
  const notExistsMatch = trimmed.match(/^!exists\('([^']*)'\)$/);
  if (notExistsMatch) {
    return !pathExists(notExistsMatch[1], cwd);
  }

  // exists('path') -- positive form. Pre-fix this fell through to the
  // truthy-string branch and incorrectly returned `true` because the
  // literal "exists('foo')" is non-empty. Add the explicit handler so
  // both forms have correct semantics.
  const existsMatch = trimmed.match(/^exists\('([^']*)'\)$/);
  if (existsMatch) {
    return pathExists(existsMatch[1], cwd);
  }

  // Null/empty check
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
    return false;
  }

  // Non-empty string is truthy
  return trimmed.length > 0 && trimmed !== 'false' && trimmed !== '0';
}

/**
 * Resolve a path literal from a workflow condition against `cwd` and
 * report whether it exists. Absolute paths pass through; relative paths
 * are resolved against `cwd` (the workflow's working directory). Errors
 * fall through as "does not exist" -- a permission error on a probe
 * path is indistinguishable from absence for routing purposes.
 *
 * Exported for direct testing in nodes.test.ts.
 */
export function pathExists(literal: string, cwd: string): boolean {
  try {
    const resolved = isAbsolutePath(literal) ? literal : `${cwd}/${literal}`;
    // existsSync is the right primitive here: we don't need to read,
    // and stat-then-check would just duplicate its work.
    return existsSync(resolved);
  } catch {
    return false;
  }
}

function isAbsolutePath(p: string): boolean {
  // POSIX absolute or Windows drive-letter absolute. Avoid pulling in
  // path.isAbsolute to keep the helper self-contained for testing.
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

// ── Trigger rule evaluator ──────────────────────────────────

/**
 * Evaluate whether a trigger rule is satisfied given upstream results.
 */
export function checkTriggerRule(
  rule: TriggerRule,
  results: NodeResult[],
): boolean {
  switch (rule) {
    case 'all_success':
      return results.length > 0 && results.every(r => r.status === 'completed');
    case 'one_success':
      return results.some(r => r.status === 'completed');
    case 'all_done':
      return results.length > 0 && results.every(r =>
        r.status === 'completed' || r.status === 'failed' || r.status === 'skipped'
      );
    case 'none_failed':
      return results.length > 0 && results.every(r => r.status !== 'failed');
    default:
      return true;
  }
}

// ── Claude JSON output parser ──────────────────────────────

interface ClaudeJsonResponse {
  result?: string;
  is_error?: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  cost_usd?: number;
  total_cost_usd?: number;
  duration_ms?: number;
  model?: string;
}

/**
 * Heuristic: does this trimmed plain-text output look like a Claude CLI
 * failure message (auth, rate limit, network, OOM, etc.)? Used by the
 * non-JSON fallback path in `parseClaudeJsonOutput` to avoid silently
 * absorbing catastrophic CLI failures as successful node output.
 */
function looksLikeErrorOutput(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('error') ||
    lower.includes('rate limit') ||
    lower.includes('authentication') ||
    lower.includes('unauthorized') ||
    lower.includes('out of memory') ||
    lower.includes('oom') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('network')
  );
}

/**
 * Parse Claude CLI `--output-format json` response.
 * Extracts text result and token usage/cost metrics.
 *
 * Throws when the CLI signals failure (`is_error: true` in the JSON, or a
 * non-JSON fallback that looks like an error message). The caller's catch
 * is responsible for producing a `failed` NodeResult so skill failures do
 * not pass silently through the orchestrator.
 *
 * @internal Exported for unit-testing in `nodes.parse-claude-output.test.ts`
 *   (Stream E item E2). Production callers should not import this directly;
 *   it stays an `executeSkill` implementation detail. No behavioral change —
 *   the export keyword is the only edit required to give the test runner
 *   access to fan-in fixture coverage without spawning a fake `claude` on
 *   PATH (which Node's child_process binary lookup makes brittle on
 *   Windows). See lattice-self-fix-2026-05-05.md E2.
 */
export function parseClaudeJsonOutput(raw: string): { text: string; cost?: NodeCost } {
  const trimmed = raw.trim();
  if (!trimmed) return { text: '' };

  let parsed: ClaudeJsonResponse;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not valid JSON — legitimate for skills that return plain text, but a
    // CLI auth/rate-limit/network failure can also exit 0 and emit a bare
    // error string. Heuristically distinguish the two.
    if (looksLikeErrorOutput(trimmed)) {
      throw new Error(`Claude CLI returned non-JSON error output: ${trimmed.slice(0, 500)}`);
    }
    return { text: trimmed };
  }

  if (parsed.is_error === true) {
    const detail = (parsed.result ?? '').trim() || 'is_error=true with no result message';
    throw new Error(`Claude CLI reported is_error=true: ${detail.slice(0, 500)}`);
  }

  const text = (parsed.result ?? '').trim();
  const usage = parsed.usage;
  const costUSD = parsed.cost_usd ?? parsed.total_cost_usd ?? 0;
  const durationMs = parsed.duration_ms ?? 0;

  if (!usage && costUSD === 0) {
    return { text };
  }

  const cost: NodeCost = {
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheCreationTokens: usage?.cache_creation_input_tokens,
      cacheReadTokens: usage?.cache_read_input_tokens,
    },
    costUSD,
    durationMs,
    model: parsed.model,
  };

  return { text, cost };
}

// ── CLI Adapter ─────────────────────────────────────────────

/**
 * Terminal-based adapter for Phase 1 (CLI execution).
 */
export class CliAdapter implements PlatformAdapter {
  async sendMessage(message: string): Promise<void> {
    console.log(message);
  }

  async promptApproval(prompt: string, options: { id: string; label: string }[]): Promise<string> {
    console.log('\n' + '='.repeat(60));
    console.log('APPROVAL REQUIRED');
    console.log('='.repeat(60));
    console.log(prompt);
    console.log('');
    for (let i = 0; i < options.length; i++) {
      console.log(`  ${i + 1}. ${options[i].label} [${options[i].id}]`);
    }
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    // HIGH-3 fix from the 2026-05-04 audit: do NOT silently default to
    // options[0] on invalid input. Approval options are often ordered for
    // narrative clarity, not safety -- defaulting to the first option can
    // pick a destructive `revise` (re-runs synthesize, burns budget) or
    // an irreversible `r1` (sides with R1 silently). On invalid/blank
    // input, re-prompt up to 3 times before throwing.
    const askOnce = (attempt: number): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        const promptText = attempt === 0
          ? 'Enter option number (or ID): '
          : `(attempt ${attempt + 1}/3) Enter option number (or ID): `;
        rl.question(promptText, (answer) => {
          const trimmed = answer.trim();
          const num = parseInt(trimmed, 10);
          if (num >= 1 && num <= options.length) {
            resolve(options[num - 1].id);
            return;
          }
          const match = options.find(o => o.id === trimmed);
          if (match) {
            resolve(match.id);
            return;
          }
          if (attempt >= 2) {
            reject(new Error(
              `Invalid approval selection "${trimmed}" after 3 attempts. Aborting workflow. ` +
              `(Pre-2026-05-04 audit fix: this used to default silently to options[0], which was ` +
              `often a destructive choice. Now: explicit selection required.)`,
            ));
            return;
          }
          console.log(`Invalid selection "${trimmed}". Try again.`);
          askOnce(attempt + 1).then(resolve).catch(reject);
        });
      });

    return askOnce(0).finally(() => rl.close());
  }

  getPlatformType(): string {
    return 'cli';
  }
}
