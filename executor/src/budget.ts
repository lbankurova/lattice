/**
 * Budget system — load config, check limits, emit alerts.
 *
 * Config lives in .lattice/budget.yaml per project.
 * Alerts: info (log), warn (user message), block (stop workflow).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import type { BudgetConfig, BudgetAlert, WorkflowCost } from './types.js';

const DEFAULT_ALERT_THRESHOLD = 0.8;

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
    };
  } catch {
    return null;
  }
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
  const icon = alert.level === 'block' ? 'BUDGET EXCEEDED' :
               alert.level === 'warn' ? 'BUDGET WARNING' : 'COST';
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
