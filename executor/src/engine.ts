/**
 * DAG execution engine.
 *
 * Resolves topological layers, dispatches nodes (parallel within layer),
 * collects outputs, writes checkpoints, handles resume from state file.
 * Integrates with .lattice/cycle-state/ files.
 */

import { readFileSync, existsSync, utimesSync } from 'node:fs';
import { atomicWriteFileSync, atomicWriteFileSyncCAS, safeAppendLineSync } from './state-io.js';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import type {
  Workflow, WorkflowNode, WorkflowRun, WorkflowCost, NodeResult, NodeStatus,
  PlatformAdapter, GateNode, ApprovalNode, ParallelNode, BudgetConfig, BudgetAlert,
} from './types.js';
import { buildExecutionLayers } from './dag.js';
import { buildInitialContext, resolveTemplate, type TemplateContext } from './template.js';
import { loadManifest } from './manifest.js';
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

  // HIGH-6 (full fix, 2026-05-05). Sanitize string-typed inputs against the
  // shell-injection allowlist BEFORE any bash node sees them. The pre-fix
  // validation lived only in cli.ts::cmdRun; autopilot dispatches workflows
  // through this function programmatically, so a topic ID sourced from a
  // TODO.md entry or a cycle-state YAML filename (both writable by any
  // skill) bypassed the CLI gate. Validating here covers every dispatch
  // path: CLI, autopilot, route-target dispatch, future API, etc.
  const SAFE_INPUT_RE = /^[A-Za-z0-9_./-]+$/;
  for (const [name, value] of Object.entries(inputs)) {
    if (typeof value === 'string' && !SAFE_INPUT_RE.test(value)) {
      throw new Error(
        `Workflow input '${name}' contains characters outside the safe set ` +
        `(allowlist: alphanumerics, _, -, ., /). Value: ${JSON.stringify(value)}. ` +
        `Refusing to run -- the value would be substituted into bash node ` +
        `commands without escaping. Sanitize the value at its source ` +
        `(rename the topic, or sanitize the TODO.md entry) and retry.`,
      );
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

  // Load project + platform manifest (lattice-project.toml, lattice-platform.toml).
  // Both are optional: greenfield projects with no TOMLs get an empty manifest
  // and the harness skill bodies emit `<<UNDEFINED:lattice.X.Y>>` sentinels for
  // any unconfigured key. Each skill is responsible for guarding its own
  // required keys and aborting with an explanatory message.
  const manifest = loadManifest(cwd);

  // Build context
  const ctx = buildInitialContext(inputs, stateData, latticeRoot, manifest);

  // Build execution layers
  const layers = buildExecutionLayers(wf);

  // Initialize run.
  //
  // `expectedRevision` is the state-file revision read at workflow start.
  // Each writeCheckpoint compares the file's current revision against this
  // value; on mismatch (concurrent writer detected), the write throws.
  // This is the CRITICAL-6 fix from the 2026-05-04 audit -- the contract
  // `revision_check: true` declared in every cycle YAML and documented in
  // CLAUDE.md/ENFORCEMENT.md was never enforced before.
  const initialRevision = parseInt(stateData['revision'] ?? '0', 10) || 0;
  const run: WorkflowRun = {
    workflowName: wf.name,
    inputs,
    startedAt: new Date().toISOString(),
    status: 'running',
    nodeResults: {},
    activeRoutes: new Set(),
    totalCost: { totalUSD: 0, totalInputTokens: 0, totalOutputTokens: 0, byNode: {} },
    expectedRevision: initialRevision,
    visitCounts: {},
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
            writeCheckpoint(wf, inputs, cwd, node.checkpoint.state_key, node.checkpoint.phase, result, run);
            // Advisory message if too many uncommitted files accumulate.
            await maybeWarnUncommitted(cwd, topicName, node.checkpoint.state_key, adapter);
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

    // ── Post-layer route-target dispatch (CRITICAL-1 fix, 2026-05-04 audit) ──
    // (max_iterations enforcement extracted to checkVisitLimit, exported for unit tests.)
    //
    // Parentless route-only targets (typically `release-lock`) are excluded
    // from the topological layer schedule by `getNodesExcludedFromLayers` so
    // they no longer execute unconditionally in Layer 0. Instead, after each
    // layer's gate/approval nodes have populated activeRoutes, we dispatch
    // any newly-activated route target whose definition is parentless.
    //
    // Targets WITH depends_on still run via normal layer scheduling (their
    // depends_on places them in a later layer; shouldExecute already gates on
    // activeRoutes).
    //
    // A4 (Stream A item A4): per-node visit count is checked against
    // `max_iterations` (default 1) before re-dispatch. The pre-A4 guard
    // `if (run.nodeResults[targetId]) continue` silently dropped re-entry
    // attempts; that matched the de-facto behavior but masked workflow
    // authors' intent (e.g., "route back to incorporate-r1 for another
    // iteration"). When `max_iterations` is set on the target, re-entry is
    // permitted up to that many total executions and the (N+1)-th attempt
    // throws a clear error rather than silently no-op'ing.
    for (const targetId of run.activeRoutes) {
      const targetNode = wf.nodes[targetId];
      if (!targetNode) continue;                            // dangling reference, ignore
      if (targetNode.depends_on && targetNode.depends_on.length > 0) continue; // not parentless

      const decision = checkVisitLimit(
        (run.visitCounts ??= {}),
        targetId,
        targetNode.max_iterations,
      );
      if (!decision.allow) {
        if (decision.throwReason) throw new Error(decision.throwReason);
        continue; // silent skip (no explicit limit)
      }
      run.visitCounts[targetId] = (run.visitCounts[targetId] ?? 0) + 1;

      await adapter.sendMessage(`  [${targetId}] ${targetNode.type} (route target) -- starting`);
      let routeResult: NodeResult;
      try {
        if (targetNode.type === 'parallel') {
          routeResult = await executeParallelGroup(
            targetId, targetNode as ParallelNode, wf, ctx, adapter, cwd,
          );
        } else {
          routeResult = await executeNode(targetId, targetNode, ctx, adapter, cwd);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        routeResult = {
          nodeId: targetId,
          status: 'failed',
          output: '',
          error: msg,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
      }
      run.nodeResults[targetId] = routeResult;
      ctx.nodes[targetId] = routeResult;
      const icon = routeResult.status === 'completed' ? 'OK' : routeResult.status === 'skipped' ? 'SKIP' : 'FAIL';
      await adapter.sendMessage(`  [${targetId}] ${icon}${routeResult.error ? ` -- ${routeResult.error}` : ''}`);

      if (routeResult.status === 'completed' && targetNode.checkpoint) {
        writeCheckpoint(wf, inputs, cwd, targetNode.checkpoint.state_key, targetNode.checkpoint.phase, routeResult, run);
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

// ── Visit-limit enforcement (A4) ────────────────────────────

export interface VisitLimitDecision {
  /** True when the node may enter (visit count is below the limit). */
  allow: boolean;
  /** When set, the caller MUST throw with this reason — explicit bound exceeded. */
  throwReason?: string;
}

/**
 * A4: enforce per-node max_iterations. Pure function — exposed so the loop
 * logic in executeWorkflow's route-target dispatch is unit-testable without
 * spinning up a full PlatformAdapter.
 *
 * Three outcomes:
 *  - allow=true: visited < limit. Caller increments visitCounts[nodeId]
 *    and executes the node.
 *  - allow=false, throwReason set: visited >= limit AND max_iterations was
 *    explicitly declared. The author opted in to a counter and exceeded
 *    their declared bound — fail loud.
 *  - allow=false, throwReason undefined: visited >= default limit (1) and
 *    no explicit max_iterations. Pre-A4 silent-skip semantics for back-
 *    compat with workflows that route to already-executed parentless
 *    targets without intending a loop.
 */
export function checkVisitLimit(
  visitCounts: Record<string, number>,
  nodeId: string,
  maxIterations: number | undefined,
): VisitLimitDecision {
  const visited = visitCounts[nodeId] ?? 0;
  const limit = maxIterations ?? 1;
  if (visited < limit) return { allow: true };
  if (visited > limit) {
    return {
      allow: false,
      throwReason:
        `Node ${nodeId} exceeded max_iterations=${limit} (visited=${visited}). ` +
        `Increase max_iterations or remove the back-route that re-drove the node.`,
    };
  }
  // visited === limit
  if (maxIterations !== undefined) {
    return {
      allow: false,
      throwReason:
        `Node ${nodeId} reached max_iterations=${limit}; route attempted to re-enter ` +
        `for the ${visited + 1}-th time. Declared bound exceeded; aborting.`,
    };
  }
  return { allow: false };
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

export function writeCheckpoint(
  wf: Workflow,
  inputs: Record<string, string | number | boolean>,
  cwd: string,
  stateKey: string,
  phase: string | undefined,
  result: NodeResult,
  run?: WorkflowRun,
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

  // Revision check (CRITICAL-6 fix from the 2026-05-04 audit). Pre-fix the
  // engine incremented the `revision` counter but never compared it against
  // an expected value, so two parallel writers could overwrite each other's
  // updates silently. The CLAUDE.md / WORKFLOW-INTERNALS / ENFORCEMENT docs
  // promised "STOP on revision mismatch" -- this is where the promise lands
  // in code. Triggered when `wf.state.revision_check === true` (declared in
  // every shipped cycle YAML).
  if (wf.state?.revision_check && run?.expectedRevision !== undefined) {
    const currentRev = typeof data['revision'] === 'number' ? data['revision'] : 0;
    if (currentRev !== run.expectedRevision) {
      throw new Error(
        `Revision mismatch on ${path}: expected ${run.expectedRevision}, found ${currentRev}. ` +
        `A concurrent writer modified this state file between our last write and now. ` +
        `Aborting to avoid clobbering the other agent's update. ` +
        `Inspect '.lattice/decisions.log' for the conflicting holder.`,
      );
    }
  }

  // Update state
  data['current_step'] = stateKey;
  if (phase) data['phase'] = phase;

  // Bump revision
  const revision = typeof data['revision'] === 'number' ? data['revision'] : 0;
  const newRev = (revision as number) + 1;
  data['revision'] = newRev;

  // Write checkpoint entry
  if (!data['checkpoints']) data['checkpoints'] = {};
  (data['checkpoints'] as Record<string, unknown>)[stateKey] = {
    completed: new Date().toISOString(),
    node: result.nodeId,
    status: result.status,
  };

  // CAS-style write (B1 fix). When `revision_check` is on, two writers
  // that both observed the file at revision N may both reach this point
  // each computing newRev=N+1. The in-memory `expectedRevision` check
  // above only compares the file's recorded revision against THIS run's
  // expectation -- it doesn't prevent a sibling run from matching its OWN
  // expectation against the same file state. The CAS path enforces
  // destination-uniqueness atomically: only one writer's `link` syscall
  // can claim the `path.tmp-rev-{N+1}` slot. The loser throws
  // RevisionMismatchError -- same recovery path as the in-memory check.
  if (wf.state?.revision_check) {
    atomicWriteFileSyncCAS(path, yaml.dump(data, { lineWidth: -1 }), newRev);
  } else {
    atomicWriteFileSync(path, yaml.dump(data, { lineWidth: -1 }));
  }
  // Update run.expectedRevision AFTER the write succeeds. Pre-fix we
  // bumped it before the write, so a thrown CAS failure would leave the
  // in-memory expectation mis-aligned with the file. Post-write update
  // keeps run.expectedRevision == file revision after every successful
  // checkpoint.
  if (run) run.expectedRevision = newRev;

  // Heartbeat: refresh the topic-lock meta mtime so long-running workflows
  // don't trip acquire-topic-lock.sh's stale threshold and lose their lock
  // mid-execution. HIGH-5 fix from the 2026-05-04 audit -- the heartbeat
  // was documented in CLAUDE.md but never implemented before this commit.
  refreshTopicLock(inputs, cwd);
}

/**
 * Refresh the topic-lock meta file's mtime so the lock doesn't go stale
 * during long workflows.
 *
 * Called after every checkpoint write. Best-effort -- if the lock dir
 * doesn't exist (workflow doesn't take a topic lock), or the meta file
 * is missing, or filesystem fails, the function silently returns. Lock
 * staleness already has its own recovery path in acquire-topic-lock.sh,
 * so a missed heartbeat means a longer workflow MIGHT trip stale; it
 * doesn't cause data loss on its own.
 *
 * Heuristic for the topic name: looks for `inputs.topic` (every cycle
 * workflow's required input). Optionally honors a per-workflow lock
 * holder prefix from `wf.lock.key` if present (e.g., mechanical-fix-cycle
 * uses `mechfix-{topic}`), but since `wf.lock.key` is a template not a
 * computed value, we do prefix matching against a small known set
 * rather than re-running the template engine. Future: pass the actual
 * acquired-lock dir into engine.runWorkflow and look it up directly.
 */
function refreshTopicLock(
  inputs: Record<string, string | number | boolean>,
  cwd: string,
): void {
  const topic = inputs['topic'];
  if (!topic || typeof topic !== 'string') return;

  // Candidate lock dirs to refresh. Try plain topic name, then known
  // prefixed variants. Whichever exists gets touched.
  const candidates = [
    `${cwd}/.lattice/cycle-lock/${topic}/meta`,
    `${cwd}/.lattice/cycle-lock/mechfix-${topic}/meta`,
    `${cwd}/.lattice/cycle-lock/bugfix-${topic}/meta`,
  ];
  const now = new Date();
  for (const metaPath of candidates) {
    try {
      if (existsSync(metaPath)) {
        utimesSync(metaPath, now, now);
        // Touch only the first matching candidate -- any extras are stale.
        return;
      }
    } catch {
      // Best-effort; ignore.
    }
  }
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

  atomicWriteFileSync(path, yaml.dump(data, { lineWidth: -1 }));
}

// ── WIP checkpoint commits ─────────────────────────────────

const WIP_UNCOMMITTED_THRESHOLD = 15;

/**
 * Emit an advisory message when the uncommitted file count exceeds the
 * threshold.
 *
 * Renamed from `maybeWipCommit` on 2026-05-05 (decision-auditor finding
 * during the audit-response review). The pre-2026-05-04 implementation
 * ran `git add -A` + `git commit` whenever 15+ files were dirty -- same
 * defect class as the seed bug, where foreign state (parallel session,
 * manual edits) got swept into a commit labeled with the workflow's
 * topic. CRITICAL-4 fix removed the auto-commit; this rename brings the
 * function name in line with the new behavior so call sites don't carry
 * a misleading `WipCommit` label for code that no longer commits.
 *
 * Decision: the agent orchestrating the workflow (or the operator)
 * decides when to commit via the project's commit-intent protocol --
 * which already enforces staged-set declaration before staging
 * (CLAUDE.md rule 23). The advisory just nudges them.
 */
async function maybeWarnUncommitted(
  cwd: string,
  topicName: string,
  stateKey: string,
  adapter: PlatformAdapter,
): Promise<void> {
  if (!topicName) return;

  try {
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8', timeout: 10_000 });
    const changedFiles = status.split('\n').filter(line => line.trim().length > 0);

    if (changedFiles.length < WIP_UNCOMMITTED_THRESHOLD) return;

    await adapter.sendMessage(
      `  [wip] ADVISORY: ${changedFiles.length} uncommitted files (threshold: ${WIP_UNCOMMITTED_THRESHOLD}) at checkpoint ${stateKey}.`,
    );
    await adapter.sendMessage(
      `  [wip] No auto-commit (CRITICAL-4 fix 2026-05-04). Run /lattice:review when ready, or commit manually with declared intent.`,
    );
  } catch {
    // Non-fatal -- if git fails, just continue
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
  const entry = `${timestamp}\t${workflowName}\t${outcome}\t${topic}\t${summary}`;
  // safeAppendLineSync caps line length so the write fits in a single
  // O_APPEND syscall and remains atomic vs. concurrent appenders.
  // MEDIUM-4 fix (2026-05-05 decision-audit follow-up).
  safeAppendLineSync(logPath, entry);
}
