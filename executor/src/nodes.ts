/**
 * Node executors — dispatch logic for each node type.
 *
 * Phase 1 (CLI): bash = child_process, skill = claude CLI, approval = terminal prompt.
 * Phase 2 (Slack): approval = Slack thread prompt.
 * Phase 3 (Headless): skill = Claude API direct call.
 */

import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { createInterface } from 'node:readline';
import type {
  WorkflowNode, BashNode, SkillNode, GateNode, ApprovalNode, ParallelNode,
  NodeResult, PlatformAdapter, TriggerRule,
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
        return executeGate(nodeId, node, ctx, startedAt);
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

async function executeBash(
  nodeId: string,
  node: BashNode,
  ctx: TemplateContext,
  cwd: string,
  startedAt: string,
): Promise<NodeResult> {
  const command = resolveTemplate(node.command, ctx);
  const timeout = node.timeout ?? 120_000;

  const opts: ExecSyncOptionsWithStringEncoding = {
    cwd,
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  try {
    const stdout = execSync(command, opts);
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

  // Phase 1: invoke Claude Code CLI
  // Phase 2+: will use Claude API directly
  const context = resolved.context ?? 'inherit';

  await adapter.sendMessage(`[${nodeId}] Executing skill: ${resolved.skill ?? 'inline prompt'}`);

  try {
    const args = [
      '--print',
      '--output-format', 'text',
    ];

    if (context === 'fresh') {
      args.push('--no-context');
    }

    // Use claude CLI
    const command = `claude ${args.join(' ')} ${shellQuote(prompt)}`;
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 600_000, // 10 min for skill execution
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    return {
      nodeId,
      status: 'completed',
      output: stdout.trim(),
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    return {
      nodeId,
      status: 'failed',
      output: (execErr.stdout ?? '').trim(),
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
    if (evaluateCondition(resolved)) {
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
 * Evaluate a simple condition expression.
 * Supports: ==, !=, contains(), !exists, exists, &&, ||, true, false.
 */
function evaluateCondition(expr: string): boolean {
  const trimmed = expr.trim();

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // && (higher precedence)
  if (trimmed.includes('&&')) {
    return trimmed.split('&&').every(part => evaluateCondition(part));
  }

  // ||
  if (trimmed.includes('||')) {
    return trimmed.split('||').some(part => evaluateCondition(part));
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

  // !exists()
  if (trimmed.startsWith("!exists('")) {
    // Would need filesystem check -- for now treat as false
    return false;
  }

  // Null/empty check
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
    return false;
  }

  // Non-empty string is truthy
  return trimmed.length > 0 && trimmed !== 'false' && trimmed !== '0';
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

// ── Helpers ─────────────────────────────────────────────────

function shellQuote(s: string): string {
  // For Windows + bash: use $'...' quoting with escaped single quotes
  return `$'${s.replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
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

    return new Promise<string>((resolve) => {
      rl.question('Enter option number (or ID): ', (answer) => {
        rl.close();
        const trimmed = answer.trim();

        // Try as number
        const num = parseInt(trimmed, 10);
        if (num >= 1 && num <= options.length) {
          resolve(options[num - 1].id);
          return;
        }

        // Try as ID
        const match = options.find(o => o.id === trimmed);
        if (match) {
          resolve(match.id);
          return;
        }

        // Default to first option
        console.log(`Invalid selection "${trimmed}", defaulting to: ${options[0].id}`);
        resolve(options[0].id);
      });
    });
  }

  getPlatformType(): string {
    return 'cli';
  }
}
