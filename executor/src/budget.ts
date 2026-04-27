/**
 * Budget system — load config, check limits, emit alerts.
 *
 * Config lives in .lattice/budget.yaml per project.
 * Alerts: info (log), warn (user message), block (stop workflow).
 *
 * Also covers context-rot monitoring (LIT-09): per-call input-token
 * utilization vs the model's context window. The rot signal is "this single
 * call used N% of its window" — distinct from cumulative USD spending. When
 * autopilot decisions degrade silently, rot is the proximate cause; this
 * module surfaces it as a first-class alert.
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import type {
  BudgetConfig, BudgetAlert, WorkflowCost, ContextConfig, ContextTelemetryEntry, AlertLevel,
} from './types.js';

const DEFAULT_ALERT_THRESHOLD = 0.8;
const DEFAULT_CONTEXT_WARN = 0.6;
const DEFAULT_CONTEXT_BLOCK = 0.8;
const TELEMETRY_PATH = '.lattice/context-telemetry.jsonl';

// ── Config loading ─────────────────────────────────────────

/**
 * Load budget config from .lattice/budget.yaml.
 * Returns null if no config exists (budget is optional).
 */
export function loadBudgetConfig(cwd: string): BudgetConfig | null {
  const path = resolve(cwd, '.lattice/budget.yaml');
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    const data = yaml.load(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return null;

    return {
      perWorkflow: parseNumberRecord(data['per_workflow']),
      perTopic: typeof data['per_topic'] === 'number' ? data['per_topic'] : undefined,
      perNode: parseNumberRecord(data['per_node']),
      alertThreshold: typeof data['alert_threshold'] === 'number'
        ? data['alert_threshold']
        : undefined,
      context: parseContextConfig(data['context']),
    };
  } catch {
    return null;
  }
}

function parseContextConfig(val: unknown): ContextConfig | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as Record<string, unknown>;
  const windowSize = obj['window_size'];
  if (typeof windowSize !== 'number' || windowSize <= 0) return undefined;
  return {
    windowSize,
    warnThreshold: typeof obj['warn_threshold'] === 'number' ? obj['warn_threshold'] : undefined,
    blockThreshold: typeof obj['block_threshold'] === 'number' ? obj['block_threshold'] : undefined,
  };
}

function parseNumberRecord(val: unknown): Record<string, number> | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (typeof v === 'number') result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// ── Budget checking ────────────────────────────────────────

/**
 * Check a single node's cost against budget limits.
 * Returns alerts (may be empty if within budget).
 */
export function checkNodeBudget(
  nodeId: string,
  nodeCostUSD: number,
  config: BudgetConfig,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  const limit = config.perNode?.[nodeId];
  if (limit === undefined) return alerts;

  const threshold = config.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;

  if (nodeCostUSD >= limit) {
    alerts.push({
      level: 'block',
      scope: 'node',
      label: nodeId,
      spentUSD: nodeCostUSD,
      limitUSD: limit,
      message: `Node "${nodeId}" cost $${nodeCostUSD.toFixed(4)} exceeds limit $${limit.toFixed(2)}`,
    });
  } else if (nodeCostUSD >= limit * threshold) {
    alerts.push({
      level: 'warn',
      scope: 'node',
      label: nodeId,
      spentUSD: nodeCostUSD,
      limitUSD: limit,
      message: `Node "${nodeId}" cost $${nodeCostUSD.toFixed(4)} is ${pct(nodeCostUSD / limit)} of $${limit.toFixed(2)} limit`,
    });
  }

  return alerts;
}

/**
 * Check accumulated workflow cost against budget limits.
 */
export function checkWorkflowBudget(
  workflowName: string,
  workflowCost: WorkflowCost,
  config: BudgetConfig,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  const limit = config.perWorkflow?.[workflowName];
  if (limit === undefined) return alerts;

  const spent = workflowCost.totalUSD;
  const threshold = config.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;

  if (spent >= limit) {
    alerts.push({
      level: 'block',
      scope: 'workflow',
      label: workflowName,
      spentUSD: spent,
      limitUSD: limit,
      message: `Workflow "${workflowName}" cost $${spent.toFixed(4)} exceeds limit $${limit.toFixed(2)}`,
    });
  } else if (spent >= limit * threshold) {
    alerts.push({
      level: 'warn',
      scope: 'workflow',
      label: workflowName,
      spentUSD: spent,
      limitUSD: limit,
      message: `Workflow "${workflowName}" cost $${spent.toFixed(4)} is ${pct(spent / limit)} of $${limit.toFixed(2)} limit`,
    });
  }

  return alerts;
}

/**
 * Check accumulated topic cost against per-topic budget.
 * topicTotalUSD includes cost from prior runs (loaded from state file).
 */
export function checkTopicBudget(
  topic: string,
  topicTotalUSD: number,
  config: BudgetConfig,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  if (config.perTopic === undefined) return alerts;

  const limit = config.perTopic;
  const threshold = config.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;

  if (topicTotalUSD >= limit) {
    alerts.push({
      level: 'block',
      scope: 'topic',
      label: topic,
      spentUSD: topicTotalUSD,
      limitUSD: limit,
      message: `Topic "${topic}" total cost $${topicTotalUSD.toFixed(4)} exceeds limit $${limit.toFixed(2)}`,
    });
  } else if (topicTotalUSD >= limit * threshold) {
    alerts.push({
      level: 'warn',
      scope: 'topic',
      label: topic,
      spentUSD: topicTotalUSD,
      limitUSD: limit,
      message: `Topic "${topic}" total cost $${topicTotalUSD.toFixed(4)} is ${pct(topicTotalUSD / limit)} of $${limit.toFixed(2)} limit`,
    });
  }

  return alerts;
}

// ── Context-rot monitoring (LIT-09) ────────────────────────

/**
 * Check a single call's input-token utilization against the configured context
 * window. Returns alerts when utilization crosses warn/block thresholds.
 *
 * The signal is per-call, not cumulative. A workflow can spend $5 (low) and
 * still rot if any single call used 90% of its context window — that's where
 * autopilot decisions degrade silently. Cache reads are not counted toward
 * utilization (they don't dilute attention the same way fresh input does).
 */
export function checkContextUtilization(
  nodeId: string,
  inputTokens: number,
  config: ContextConfig,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  const utilization = inputTokens / config.windowSize;
  const warnAt = config.warnThreshold ?? DEFAULT_CONTEXT_WARN;
  const blockAt = config.blockThreshold ?? DEFAULT_CONTEXT_BLOCK;

  if (utilization >= blockAt) {
    alerts.push({
      level: 'block',
      scope: 'context',
      label: nodeId,
      tokensSpent: inputTokens,
      tokenLimit: config.windowSize,
      utilization,
      message: `Node "${nodeId}" used ${pct(utilization)} of context window (${fmtK(inputTokens)}/${fmtK(config.windowSize)} tok); attention degradation likely. Suggest fresh agent or /clear.`,
    });
  } else if (utilization >= warnAt) {
    alerts.push({
      level: 'warn',
      scope: 'context',
      label: nodeId,
      tokensSpent: inputTokens,
      tokenLimit: config.windowSize,
      utilization,
      message: `Node "${nodeId}" used ${pct(utilization)} of context window (${fmtK(inputTokens)}/${fmtK(config.windowSize)} tok); approaching rot threshold.`,
    });
  }

  return alerts;
}

/**
 * Append one telemetry entry to .lattice/context-telemetry.jsonl. Used for
 * post-hoc inspection (CLI `lattice context`) and to give the autopilot loop
 * a record it can reason from.
 *
 * Note: log grows unbounded today. Rotation/retention is future work — when
 * the file exceeds a practical inspection window (~10 MB), add a rotate step.
 */
export function appendContextTelemetry(cwd: string, entry: ContextTelemetryEntry): void {
  const path = resolve(cwd, TELEMETRY_PATH);
  try {
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Telemetry is best-effort — never fail a workflow because we couldn't write a log line.
  }
}

/**
 * Read the last N entries from the telemetry log (most recent last).
 * Returns [] if no log exists or it cannot be parsed.
 */
export function readContextTelemetry(cwd: string, lastN = 50): ContextTelemetryEntry[] {
  const path = resolve(cwd, TELEMETRY_PATH);
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    const slice = lines.slice(-lastN);
    const out: ContextTelemetryEntry[] = [];
    for (const line of slice) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line) as ContextTelemetryEntry);
      } catch { /* skip malformed line */ }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Classify utilization into a level for telemetry rows. Mirrors checkContextUtilization
 * thresholds so the JSONL log is self-consistent with the live alerts.
 */
export function classifyUtilization(
  utilization: number,
  config: ContextConfig,
): AlertLevel | 'ok' {
  const warnAt = config.warnThreshold ?? DEFAULT_CONTEXT_WARN;
  const blockAt = config.blockThreshold ?? DEFAULT_CONTEXT_BLOCK;
  if (utilization >= blockAt) return 'block';
  if (utilization >= warnAt) return 'warn';
  return 'ok';
}

// ── Cost from state file ───────────────────────────────────

/**
 * Read accumulated topic cost from a cycle-state YAML file.
 * Returns 0 if no cost data found.
 */
export function readTopicCost(statePath: string): number {
  if (!existsSync(statePath)) return 0;

  try {
    const raw = readFileSync(statePath, 'utf-8');
    const data = yaml.load(raw) as Record<string, unknown>;
    const cost = data?.['cost'] as Record<string, unknown> | undefined;
    if (cost && typeof cost['total_usd'] === 'number') {
      return cost['total_usd'];
    }
  } catch { /* corrupt state — treat as zero */ }

  return 0;
}

// ── Formatting ─────────────────────────────────────────────

export function formatAlert(alert: BudgetAlert): string {
  const isContext = alert.scope === 'context';
  const icon = alert.level === 'block'
    ? (isContext ? 'CONTEXT ROT' : 'BUDGET EXCEEDED')
    : alert.level === 'warn'
      ? (isContext ? 'CONTEXT WARNING' : 'BUDGET WARNING')
      : 'COST';
  return `[${icon}] ${alert.message}`;
}

export function formatCostSummary(cost: WorkflowCost): string {
  const lines: string[] = [];
  lines.push(`Cost: $${cost.totalUSD.toFixed(4)}`);
  lines.push(`Tokens: ${fmtK(cost.totalInputTokens)} in / ${fmtK(cost.totalOutputTokens)} out`);

  const nodes = Object.entries(cost.byNode);
  if (nodes.length > 0) {
    lines.push('');
    lines.push('Per node:');
    for (const [id, nc] of nodes) {
      lines.push(`  ${id.padEnd(30)} $${nc.costUSD.toFixed(4)}  ${fmtK(nc.usage.inputTokens + nc.usage.outputTokens)} tok  ${(nc.durationMs / 1000).toFixed(1)}s`);
    }
  }

  return lines.join('\n');
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
