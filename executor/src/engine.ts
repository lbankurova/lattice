/**
 * DAG execution engine.
 *
 * Resolves topological layers, dispatches nodes (parallel within layer),
 * collects outputs, writes checkpoints, handles resume from state file.
 * Integrates with .lattice/cycle-state/ files.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type {
  Workflow, WorkflowNode, WorkflowRun, NodeResult, NodeStatus,
  PlatformAdapter, GateNode, ApprovalNode, ParallelNode,
} from './types.js';
import { buildExecutionLayers } from './dag.js';
import { buildInitialContext, resolveTemplate, type TemplateContext } from './template.js';
import { executeNode, checkTriggerRule } from './nodes.js';

export interface EngineOptions {
  /** Working directory for bash commands and state files */
  cwd: string;
  /** Platform adapter (CLI, Slack, etc.) */
  adapter: PlatformAdapter;
  /** Dry run — log what would execute without running */
  dryRun?: boolean;
  /** Lattice root directory (for resolving skill paths) */
  latticeRoot: string;
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

  // Load state for resume
  const stateData = loadStateFile(wf, inputs, cwd);
  const completedKeys = getCompletedCheckpoints(stateData);

  // Build context
  const ctx = buildInitialContext(inputs, stateData);

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
  };

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
        run.nodeResults[id] = {
          nodeId: id,
          status: 'completed',
          output: '(dry run)',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
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

        // Log result
        const statusIcon = result.status === 'completed' ? 'OK' :
                          result.status === 'skipped' ? 'SKIP' : 'FAIL';
        await adapter.sendMessage(`  [${result.nodeId}] ${statusIcon}${result.route ? ` -> ${result.route}` : ''}`);

        // Update active routes for gate/approval nodes
        if (result.route) {
          run.activeRoutes.add(result.route);
        }

        // Write checkpoint
        if (result.status === 'completed') {
          const node = wf.nodes[result.nodeId];
          if (node.checkpoint) {
            writeCheckpoint(wf, inputs, cwd, node.checkpoint.state_key, node.checkpoint.phase, result);
          }
        }

        // Check for failures
        if (result.status === 'failed') {
          const node = wf.nodes[result.nodeId];
          if (node.type === 'bash' && (node.on_failure === 'stop' || !node.on_failure)) {
            await adapter.sendMessage(`[${wf.name}] STOPPED -- ${result.nodeId} failed: ${result.error}`);
            run.status = 'failed';
            run.completedAt = new Date().toISOString();
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

  await adapter.sendMessage(`[${wf.name}] Workflow completed`);
  logDecision(cwd, wf.name, 'COMPLETED', inputs, `${Object.keys(run.nodeResults).length} nodes executed`);

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

function getCompletedCheckpoints(stateData: Record<string, string>): Set<string> {
  const completed = new Set<string>();
  // The checkpoints section in state files lists completed steps
  // For now, treat current_step as the last completed checkpoint
  const currentStep = stateData['current_step'];
  if (currentStep) {
    // All steps before current_step are completed
    // This is a simplified heuristic -- full implementation would track
    // each checkpoint individually in the state file
    completed.add(currentStep);
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
