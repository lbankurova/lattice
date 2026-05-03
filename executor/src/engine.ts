/**
 * DAG execution engine.
 *
 * Resolves topological layers, dispatches nodes (parallel within layer),
 * collects outputs, writes checkpoints, handles resume from state file.
 * Integrates with .lattice/cycle-state/ files.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import type {
  Workflow, WorkflowNode, WorkflowRun, WorkflowCost, NodeResult, NodeStatus,
  PlatformAdapter, GateNode, ApprovalNode, ParallelNode, BudgetConfig, BudgetAlert,
} from './types.js';
import { buildExecutionLayers } from './dag.js';
import { buildInitialContext, resolveTemplate, type TemplateContext } from './template.js';
import { executeNode, checkTriggerRule } from './nodes.js';
import { loadPortfolioState, checkCoherence, isTopicSafe, formatReport } from './coherence.js';
import { resolve } from 'node:path';
import {
  loadBudgetConfig, checkNodeBudget, checkWorkflowBudget,
  checkTopicBudget, readTopicCost, formatAlert, formatCostSummary,
  checkContextUtilization, appendContextTelemetry, classifyUtilization,
} from './budget.js';

export interface EngineOptions {
  /** Working directory for bash commands and state files */
  cwd: string;
  /** Platform adapter (CLI, Slack, etc.) */
  adapter: PlatformAdapter;
  /** Dry run — log what would execute without running */
  dryRun?: boolean;
  /** Lattice root directory (for resolving skill paths) */
  latticeRoot: string;
  /** Skip coherence check (for sub-workflows called by autopilot which already checked) */
  skipCoherence?: boolean;
}

/**
 * Execute a workflow from start to finish (or resume from checkpoint).
 */
export async function executeWorkflow(
  wf: Workflow,
  inputs: Record<string, string | number | boolean>,
  opts: EngineOptions,
): Promise<WorkflowRun> {
  const { cwd, adapter, dryRun, latticeRoot } = opts;

  // Validate required inputs
  for (const [name, spec] of Object.entries(wf.inputs)) {
    if (spec.required && !(name in inputs)) {
      if (spec.default !== undefined) {
        inputs[name] = spec.default;
      } else {
        throw new Error(`Missing required input: ${name}`);
      }
    }
  }

  // Apply defaults
  for (const [name, spec] of Object.entries(wf.inputs)) {
    if (!(name in inputs) && spec.default !== undefined) {
      inputs[name] = spec.default;
    }
  }

  // Coherence gate — check for cross-topic conflicts before advancing
  const topicName = String(inputs['topic'] ?? '');
  if (!opts.skipCoherence && topicName) {
    const stateDir = resolve(cwd, '.lattice/cycle-state');
    if (existsSync(stateDir)) {
      const portfolio = loadPortfolioState(stateDir, cwd);
      if (portfolio.length > 0) {
        const report = checkCoherence(portfolio);
        const safety = isTopicSafe(topicName, report);

        if (!safety.safe) {
          await adapter.sendMessage(`\nCOHERENCE CHECK FAILED for "${topicName}":`);
          for (const c of safety.conflicts) {
            await adapter.sendMessage(`  [${c.severity}] ${c.type}: ${c.description}`);
            await adapter.sendMessage(`  -> ${c.recommendation}`);
          }

          const blockers = safety.conflicts.filter(c => c.severity === 'blocker');
          if (blockers.length > 0) {
            // Ask the human: proceed anyway or stop?
            const decision = await adapter.promptApproval(
              `${blockers.length} blocker(s) detected. Proceeding may build against stale or conflicting assumptions.`,
              [
                { id: 'stop', label: 'Stop — resolve conflicts first' },
                { id: 'proceed', label: 'Proceed anyway — I accept the risk' },
              ]
            );

            if (decision === 'stop') {
              return {
                workflowName: wf.name,
                inputs,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                status: 'paused',
                nodeResults: {},
                activeRoutes: new Set(),
                totalCost: { totalUSD: 0, totalInputTokens: 0, totalOutputTokens: 0, byNode: {} },
              };
            }
            await adapter.sendMessage('Coherence override accepted. Proceeding with known conflicts.');
          }
        } else {
          await adapter.sendMessage(`Coherence check: CLEAN (no conflicts for "${topicName}")`);
        }
      }
    }
  }

  // Load state for resume
  const stateData = loadStateFile(wf, inputs, cwd);
  const completedKeys = getCompletedCheckpoints(wf, inputs, cwd);

  // Build context
  const ctx = buildInitialContext(inputs, stateData, latticeRoot);

  // Build execution layers
  const layers = buildExecutionLayers(wf);

  // Initialize run
  const run: WorkflowRun = {
    workflowName: wf.name,
    inputs,
    startedAt: new Date().toISOString(),
    status: 'running',
    nodeResults: {},
    activeRoutes: new Set(),
    totalCost: { totalUSD: 0, totalInputTokens: 0, totalOutputTokens: 0, byNode: {} },
  };

  // Load budget config (optional)
  const budget = loadBudgetConfig(cwd);
  const priorTopicCost = topicName
    ? readTopicCost(resolveStatePath(wf, inputs, cwd) ?? '')
    : 0;

  await adapter.sendMessage(
    `[${wf.name}] Starting workflow (${Object.keys(wf.nodes).length} nodes, ${layers.length} layers)`
  );

  // Execute layer by layer
  for (const layer of layers) {
    const layerNodes = layer.nodeIds.filter(id => shouldExecute(id, wf, run, ctx, completedKeys));

    if (layerNodes.length === 0) continue;

    if (dryRun) {
      await adapter.sendMessage(
        `[dry-run] Layer ${layer.index}: ${layerNodes.join(', ')}`
      );
      for (const id of layerNodes) {
        // Synthetic result tagged with dryRun:true. Template engine throws
        // if any downstream node references {{nodes.<id>.output}} so dry-run
        // can never silently propagate the literal "(dry run)" string into
        // bash commands, gate conditions, or skill prompts.
        run.nodeResults[id] = {
          nodeId: id,
          status: 'completed',
          output: '(dry run)',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          dryRun: true,
        };
        ctx.nodes[id] = run.nodeResults[id];
      }
      continue;
    }

    // Execute nodes in this layer concurrently
    const results = await Promise.allSettled(
      layerNodes.map(async (id) => {
        const node = wf.nodes[id];
        await adapter.sendMessage(`  [${id}] ${node.type} -- starting`);

        let result: NodeResult;

        if (node.type === 'parallel') {
          result = await executeParallelGroup(id, node as ParallelNode, wf, ctx, adapter, cwd);
        } else {
          result = await executeNode(id, node, ctx, adapter, cwd);
        }

        return result;
      })
    );

    // Collect results
    for (const settled of results) {
      if (settled.status === 'fulfilled') {
        const result = settled.value;
        run.nodeResults[result.nodeId] = result;
        ctx.nodes[result.nodeId] = result;

        // Accumulate cost
        if (result.cost) {
          run.totalCost.totalUSD += result.cost.costUSD;
          run.totalCost.totalInputTokens += result.cost.usage.inputTokens;
          run.totalCost.totalOutputTokens += result.cost.usage.outputTokens;
          run.totalCost.byNode[result.nodeId] = result.cost;
        }

        // Log result (include cost if present)
        const statusIcon = result.status === 'completed' ? 'OK' :
                          result.status === 'skipped' ? 'SKIP' : 'FAIL';
        const costTag = result.cost ? ` ($${result.cost.costUSD.toFixed(4)})` : '';
        await adapter.sendMessage(`  [${result.nodeId}] ${statusIcon}${costTag}${result.route ? ` -> ${result.route}` : ''}`);

        // Budget + context checks
        if (result.cost) {
          const alerts: BudgetAlert[] = [];
          if (budget) {
            alerts.push(
              ...checkNodeBudget(result.nodeId, result.cost.costUSD, budget),
              ...checkWorkflowBudget(wf.name, run.totalCost, budget),
              ...checkTopicBudget(topicName, priorTopicCost + run.totalCost.totalUSD, budget),
            );
          }

          // Context-rot telemetry: always log a row when the node returned a cost,
          // even if no context config is set (level=ok). Active alerts only fire when
          // context config is present.
          const inputTokens = result.cost.usage.inputTokens;
          const utilization = budget?.context
            ? inputTokens / budget.context.windowSize
            : 0;
          const level = budget?.context
            ? classifyUtilization(utilization, budget.context)
            : 'ok';
          appendContextTelemetry(cwd, {
            ts: new Date().toISOString(),
            workflow: wf.name,
            node: result.nodeId,
            inputTokens,
            outputTokens: result.cost.usage.outputTokens,
            cacheReadTokens: result.cost.usage.cacheReadTokens,
            utilization,
            level,
          });
          if (budget?.context) {
            alerts.push(...checkContextUtilization(result.nodeId, inputTokens, budget.context));
          }

          for (const alert of alerts) {
            await adapter.sendMessage(`  ${formatAlert(alert)}`);
          }

          // Block on budget OR context-rot exceeded
          if (alerts.some(a => a.level === 'block')) {
            const reason = alerts.find(a => a.level === 'block')?.scope === 'context'
              ? 'context-rot threshold exceeded'
              : 'budget exceeded';
            await adapter.sendMessage(`[${wf.name}] STOPPED -- ${reason}`);
            run.status = 'failed';
            run.completedAt = new Date().toISOString();
            writeCostToState(wf, inputs, cwd, run.totalCost);
            logDecision(cwd, wf.name, reason === 'context-rot threshold exceeded' ? 'CONTEXT_ROT' : 'BUDGET_EXCEEDED', inputs,
              `$${run.totalCost.totalUSD.toFixed(4)} spent`);
            return run;
          }
        }

        // Update active routes for gate/approval nodes
        if (result.route) {
          run.activeRoutes.add(result.route);
        }

        // Write checkpoint
        if (result.status === 'completed') {
          const node = wf.nodes[result.nodeId];
          if (node.checkpoint) {
            writeCheckpoint(wf, inputs, cwd, node.checkpoint.state_key, node.checkpoint.phase, result);
            // WIP commit if too many uncommitted files accumulate
            await maybeWipCommit(cwd, topicName, node.checkpoint.state_key, adapter);
          }
        }

        // Check for failures
        if (result.status === 'failed') {
          const node = wf.nodes[result.nodeId];
          if (node.type === 'bash' && (node.on_failure === 'stop' || !node.on_failure)) {
            await adapter.sendMessage(`[${wf.name}] STOPPED -- ${result.nodeId} failed: ${result.error}`);
            run.status = 'failed';
            run.completedAt = new Date().toISOString();
            writeCostToState(wf, inputs, cwd, run.totalCost);
            logDecision(cwd, wf.name, 'FAILED', inputs, `${result.nodeId}: ${result.error}`);
            return run;
          }
        }
      } else {
        // Promise rejected (unexpected)
        const error = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        await adapter.sendMessage(`  [???] Unexpected error: ${error}`);
      }
    }
  }

  run.status = 'completed';
  run.completedAt = new Date().toISOString();

  // Persist cost to state file
  if (run.totalCost.totalUSD > 0) {
    writeCostToState(wf, inputs, cwd, run.totalCost);
  }

  await adapter.sendMessage(`[${wf.name}] Workflow completed`);
  if (run.totalCost.totalUSD > 0) {
    await adapter.sendMessage(formatCostSummary(run.totalCost));
  }
  logDecision(cwd, wf.name, 'COMPLETED', inputs,
    `${Object.keys(run.nodeResults).length} nodes, $${run.totalCost.totalUSD.toFixed(4)}`);

  return run;
}

// ── Node filtering ──────────────────────────────────────────

/**
 * Determine whether a node should execute based on:
 * 1. Resume: skip if checkpoint already completed
 * 2. Routing: skip if a gate/approval routed away from this node
 * 3. Conditions: skip if condition evaluates to false
 * 4. Dependencies: skip if upstream failed (unless trigger rule allows)
 */
function shouldExecute(
  nodeId: string,
  wf: Workflow,
  run: WorkflowRun,
  ctx: TemplateContext,
  completedKeys: Set<string>,
): boolean {
  const node = wf.nodes[nodeId];

  // 1. Resume: skip if this checkpoint was already completed
  if (node.checkpoint?.state_key && completedKeys.has(node.checkpoint.state_key)) {
    return false;
  }

  // 2. Routing: check if this node needs to be on an active route
  // A node that is a route target only executes if it was routed to
  if (isRouteTarget(nodeId, wf)) {
    if (!run.activeRoutes.has(nodeId) && !isAlwaysReachable(nodeId, wf, run)) {
      return false;
    }
  }

  // 3. Condition: evaluate if present
  if (node.condition) {
    const resolved = resolveTemplate(node.condition, ctx);
    if (!resolved || resolved === 'false' || resolved === '0' || resolved === '') {
      return false;
    }
  }

  // 4. Dependencies: check upstream results
  for (const dep of node.depends_on ?? []) {
    const depResult = run.nodeResults[dep];
    if (!depResult) continue; // not yet executed (shouldn't happen in layer-by-layer)
    if (depResult.status === 'failed') {
      return false; // upstream failed, skip this node
    }
  }

  return true;
}

/**
 * Check if a node is referenced as a route target by any gate or approval node.
 */
function isRouteTarget(nodeId: string, wf: Workflow): boolean {
  for (const node of Object.values(wf.nodes)) {
    if (node.type === 'gate') {
      for (const cond of (node as GateNode).evaluate) {
        if (cond.route === nodeId) return true;
      }
    }
    if (node.type === 'approval') {
      for (const opt of (node as ApprovalNode).options) {
        if (opt.route === nodeId) return true;
      }
    }
  }
  return false;
}

/**
 * Check if a node is reachable through standard depends_on edges
 * (not only through routing). If it has depends_on that are completed,
 * it's reachable regardless of routing.
 */
function isAlwaysReachable(nodeId: string, wf: Workflow, run: WorkflowRun): boolean {
  const node = wf.nodes[nodeId];
  const deps = node.depends_on ?? [];
  if (deps.length === 0) return true; // root node

  // If all deps completed and none of them are gate/approval nodes that route elsewhere
  return deps.every(dep => {
    const result = run.nodeResults[dep];
    if (!result || result.status !== 'completed') return false;

    // If the dep is a gate/approval that routed somewhere else, this node isn't reachable
    if (result.route && result.route !== nodeId) return false;

    return true;
  });
}

// ── Parallel group executor ─────────────────────────────────

async function executeParallelGroup(
  groupId: string,
  node: ParallelNode,
  wf: Workflow,
  ctx: TemplateContext,
  adapter: PlatformAdapter,
  cwd: string,
): Promise<NodeResult> {
  const startedAt = new Date().toISOString();
  const rule = node.trigger_rule ?? 'all_success';

  const results = await Promise.allSettled(
    node.nodes.map(async (childId) => {
      const childNode = wf.nodes[childId];
      return executeNode(childId, childNode, ctx, adapter, cwd);
    })
  );

  const childResults: NodeResult[] = [];
  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      childResults.push(settled.value);
      ctx.nodes[settled.value.nodeId] = settled.value;
    }
  }

  const satisfied = checkTriggerRule(rule, childResults);
  const outputs = childResults.map(r => `${r.nodeId}: ${r.status}`).join(', ');

  return {
    nodeId: groupId,
    status: satisfied ? 'completed' : 'failed',
    output: outputs,
    startedAt,
    completedAt: new Date().toISOString(),
    error: satisfied ? undefined : `Trigger rule "${rule}" not satisfied`,
  };
}

// ── State file management ───────────────────────────────────

function resolveStatePath(wf: Workflow, inputs: Record<string, string | number | boolean>, cwd: string): string | null {
  if (!wf.state?.file) return null;
  // Simple template resolution for state path
  let path = wf.state.file;
  for (const [key, value] of Object.entries(inputs)) {
    path = path.replace(`{{inputs.${key}}}`, String(value));
  }
  const unresolved = path.match(/\{\{\s*inputs\.([^}\s]+)\s*\}\}/);
  if (unresolved) {
    throw new Error(
      `resolveStatePath: state.file template '${wf.state.file}' references input '${unresolved[1]}' which is not provided. Refusing to write literal '{{...}}' filename.`
    );
  }
  return `${cwd}/${path}`;
}

function loadStateFile(
  wf: Workflow,
  inputs: Record<string, string | number | boolean>,
  cwd: string,
): Record<string, string> {
  const path = resolveStatePath(wf, inputs, cwd);
  if (!path || !existsSync(path)) return {};

  try {
    const content = readFileSync(path, 'utf-8');
    const data = yaml.load(content) as Record<string, unknown>;
    // Flatten to string values
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[key] = String(value);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function getCompletedCheckpoints(
  wf: Workflow,
  inputs: Record<string, string | number | boolean>,
  cwd: string,
): Set<string> {
  const completed = new Set<string>();
  const path = resolveStatePath(wf, inputs, cwd);
  if (!path || !existsSync(path)) return completed;
  try {
    const data = yaml.load(readFileSync(path, 'utf-8')) as Record<string, unknown> ?? {};
    const checkpoints = data['checkpoints'];
    if (checkpoints && typeof checkpoints === 'object') {
      for (const key of Object.keys(checkpoints as Record<string, unknown>)) {
        completed.add(key);
      }
    }
  } catch {
    // ignore — partial/corrupt state means resume from start
  }
  return completed;
}

function writeCheckpoint(
  wf: Workflow,
  inputs: Record<string, string | number | boolean>,
  cwd: string,
  stateKey: string,
  phase: string | undefined,
  result: NodeResult,
): void {
  const path = resolveStatePath(wf, inputs, cwd);
  if (!path) return;

  let data: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      data = yaml.load(readFileSync(path, 'utf-8')) as Record<string, unknown> ?? {};
    } catch {
      data = {};
    }
  }

  // Update state
  data['current_step'] = stateKey;
  if (phase) data['phase'] = phase;

  // Revision check
  const revision = typeof data['revision'] === 'number' ? data['revision'] : 0;
  data['revision'] = (revision as number) + 1;

  // Write checkpoint entry
  if (!data['checkpoints']) data['checkpoints'] = {};
  (data['checkpoints'] as Record<string, unknown>)[stateKey] = {
    completed: new Date().toISOString(),
    node: result.nodeId,
    status: result.status,
  };

  writeFileSync(path, yaml.dump(data, { lineWidth: -1 }), 'utf-8');
}

// ── Cost persistence ───────────────────────────────────────

function writeCostToState(
  wf: Workflow,
  inputs: Record<string, string | number | boolean>,
  cwd: string,
  cost: WorkflowCost,
): void {
  const path = resolveStatePath(wf, inputs, cwd);
  if (!path) return;

  let data: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      data = yaml.load(readFileSync(path, 'utf-8')) as Record<string, unknown> ?? {};
    } catch {
      data = {};
    }
  }

  // Merge with existing cost data (accumulates across workflow runs)
  const existing = (data['cost'] as Record<string, unknown>) ?? {};
  const priorUSD = typeof existing['total_usd'] === 'number' ? existing['total_usd'] : 0;
  const priorIn = typeof existing['total_input_tokens'] === 'number' ? existing['total_input_tokens'] : 0;
  const priorOut = typeof existing['total_output_tokens'] === 'number' ? existing['total_output_tokens'] : 0;
  const priorNodes = (existing['nodes'] as Record<string, unknown>) ?? {};

  // Merge per-node costs
  const mergedNodes: Record<string, unknown> = { ...priorNodes };
  for (const [nodeId, nc] of Object.entries(cost.byNode)) {
    mergedNodes[nodeId] = {
      cost_usd: nc.costUSD,
      input_tokens: nc.usage.inputTokens,
      output_tokens: nc.usage.outputTokens,
      duration_ms: nc.durationMs,
      model: nc.model,
    };
  }

  data['cost'] = {
    total_usd: priorUSD + cost.totalUSD,
    total_input_tokens: priorIn + cost.totalInputTokens,
    total_output_tokens: priorOut + cost.totalOutputTokens,
    last_run: new Date().toISOString(),
    nodes: mergedNodes,
  };

  writeFileSync(path, yaml.dump(data, { lineWidth: -1 }), 'utf-8');
}

// ── WIP checkpoint commits ─────────────────────────────────

const WIP_UNCOMMITTED_THRESHOLD = 15;

/**
 * Create a WIP commit if the uncommitted file count exceeds the threshold.
 * These get squashed in the final review commit.
 */
async function maybeWipCommit(
  cwd: string,
  topicName: string,
  stateKey: string,
  adapter: PlatformAdapter,
): Promise<void> {
  if (!topicName) return;

  try {
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8', timeout: 10000 });
    const changedFiles = status.split('\n').filter(line => line.trim().length > 0);

    if (changedFiles.length < WIP_UNCOMMITTED_THRESHOLD) return;

    await adapter.sendMessage(
      `  [wip] ${changedFiles.length} uncommitted files (threshold: ${WIP_UNCOMMITTED_THRESHOLD}) -- creating checkpoint commit`
    );

    execSync('git add -A', { cwd, timeout: 10000 });
    const msg = `wip: ${topicName} checkpoint ${stateKey}\n\nTopic: ${topicName}`;
    execSync(`git commit -m "${msg}"`, { cwd, encoding: 'utf-8', timeout: 30000 });

    await adapter.sendMessage(`  [wip] Checkpoint commit created`);
  } catch {
    // Non-fatal -- if git fails, just continue without the WIP commit
  }
}

// ── Decision logging ────────────────────────────────────────

function logDecision(
  cwd: string,
  workflowName: string,
  outcome: string,
  inputs: Record<string, string | number | boolean>,
  summary: string,
): void {
  const logPath = `${cwd}/.lattice/decisions.log`;
  const timestamp = new Date().toISOString();
  const topic = inputs['topic'] ?? workflowName;
  const entry = `${timestamp}\t${workflowName}\t${outcome}\t${topic}\t${summary}\n`;

  try {
    appendFileSync(logPath, entry, 'utf-8');
  } catch {
    // Log directory may not exist -- non-fatal
  }
}
