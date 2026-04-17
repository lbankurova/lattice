#!/usr/bin/env node

/**
 * Lattice CLI — DAG workflow executor.
 *
 * Usage:
 *   lattice run <workflow> --topic <topic> [--dry-run] [--mode <mode>]
 *   lattice validate <workflow>
 *   lattice list
 *   lattice inspect <workflow>
 */

import { resolve, dirname } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import { loadWorkflow, resolveWorkflowPath } from './loader.js';
import { buildExecutionLayers } from './dag.js';
import { executeWorkflow } from './engine.js';
import { CliAdapter } from './nodes.js';
import { loadPortfolioState, checkCoherence, isTopicSafe, formatReport } from './coherence.js';
import { runAutopilot } from './autopilot.js';
import { reconcileStates, formatReconciliation } from './reconcile.js';
import {
  loadE2EConfig, getChangedFiles, classifyTestability,
  detectComparisonMode, runBranchComparison, writeE2EResult,
  formatE2EResult, formatClassification,
} from './e2e.js';
import { formatCostSummary } from './budget.js';
import type { WorkflowCost } from './types.js';

// ── Argument parsing ────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function findLatticeRoot(): string {
  // Explicit flag takes priority
  const flags = parseArgs();
  if (flags['lattice-root']) {
    const explicit = resolve(flags['lattice-root']);
    if (existsSync(resolve(explicit, 'workflows'))) return explicit;
    throw new Error(`--lattice-root "${explicit}" has no workflows/ directory`);
  }

  // LATTICE_ROOT env var
  if (process.env['LATTICE_ROOT']) {
    const envRoot = resolve(process.env['LATTICE_ROOT']);
    if (existsSync(resolve(envRoot, 'workflows'))) return envRoot;
  }

  // Walk up from CWD looking for a directory with workflows/
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'workflows'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback: use __dirname parent (executor is inside lattice/)
  // Handle Windows file:// URL paths
  let modulePath = new URL(import.meta.url).pathname;
  if (process.platform === 'win32' && modulePath.startsWith('/')) {
    modulePath = modulePath.slice(1); // Remove leading / on Windows
  }
  const fromModule = resolve(dirname(modulePath), '..', '..');
  if (existsSync(resolve(fromModule, 'workflows'))) return fromModule;

  throw new Error(
    'Cannot find lattice root (no workflows/ directory found).\n' +
    'Set LATTICE_ROOT env var or pass --lattice-root <path>.'
  );
}

function parseArgs(): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      result[key] = value;
      if (value !== 'true') i++;
    }
  }
  return result;
}

// ── Commands ────────────────────────────────────────────────

async function cmdRun(): Promise<void> {
  const workflowName = args[1];
  if (!workflowName) {
    console.error('Usage: lattice run <workflow> --topic <topic> [--dry-run]');
    process.exit(1);
  }

  const flags = parseArgs();
  const latticeRoot = findLatticeRoot();
  const wfPath = resolveWorkflowPath(workflowName, latticeRoot);
  const wf = loadWorkflow(wfPath);

  // Build inputs from flags
  const inputs: Record<string, string | number | boolean> = {};
  for (const [key, spec] of Object.entries(wf.inputs)) {
    if (flags[key]) {
      inputs[key] = spec.type === 'boolean' ? flags[key] === 'true' :
                     spec.type === 'integer' ? parseInt(flags[key], 10) :
                     flags[key];
    }
  }

  // Also pass mode and force if present
  if (flags['mode']) inputs['mode'] = flags['mode'];
  if (flags['force']) inputs['force'] = true;

  const adapter = new CliAdapter();
  const dryRun = 'dry-run' in flags;

  // Determine working directory: use project root (CWD), not lattice root
  const cwd = process.cwd();

  console.log(`Lattice Executor v0.1.0`);
  console.log(`Workflow: ${wf.name} (${wfPath})`);
  console.log(`Inputs: ${JSON.stringify(inputs)}`);
  console.log(`CWD: ${cwd}`);
  if (dryRun) console.log(`Mode: DRY RUN`);
  console.log('');

  const run = await executeWorkflow(wf, inputs, {
    cwd,
    adapter,
    dryRun,
    latticeRoot,
  });

  // Print summary
  console.log('');
  console.log('='.repeat(60));
  console.log(`Workflow: ${run.workflowName}`);
  console.log(`Status: ${run.status}`);
  console.log(`Duration: ${duration(run.startedAt, run.completedAt)}`);
  console.log(`Nodes: ${Object.keys(run.nodeResults).length} executed`);

  if (run.totalCost.totalUSD > 0) {
    console.log('');
    console.log(formatCostSummary(run.totalCost));
  }

  const failed = Object.values(run.nodeResults).filter(r => r.status === 'failed');
  if (failed.length > 0) {
    console.log(`\nFailed nodes:`);
    for (const r of failed) {
      console.log(`  ${r.nodeId}: ${r.error}`);
    }
  }

  process.exit(run.status === 'completed' ? 0 : 1);
}

function cmdValidate(): void {
  const workflowName = args[1];
  const latticeRoot = findLatticeRoot();

  if (workflowName) {
    const wfPath = resolveWorkflowPath(workflowName, latticeRoot);
    validateOne(wfPath);
  } else {
    // Validate all
    const dir = resolve(latticeRoot, 'workflows');
    const files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    let total = 0;
    for (const file of files) {
      validateOne(resolve(dir, file));
      total++;
    }
    console.log(`\n${total} workflows validated.`);
  }
}

function validateOne(path: string): void {
  try {
    const wf = loadWorkflow(path);
    const layers = buildExecutionLayers(wf);
    const nodeCount = Object.keys(wf.nodes).length;
    console.log(`${wf.name}: OK (${nodeCount} nodes, ${layers.length} layers)`);
  } catch (err) {
    console.error(`FAIL: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function cmdList(): void {
  const latticeRoot = findLatticeRoot();
  const dir = resolve(latticeRoot, 'workflows');

  if (!existsSync(dir)) {
    console.error(`No workflows directory found at ${dir}`);
    process.exit(1);
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  console.log('Available workflows:\n');
  for (const file of files) {
    try {
      const wf = loadWorkflow(resolve(dir, file));
      const nodeCount = Object.keys(wf.nodes).length;
      console.log(`  ${wf.name.padEnd(25)} ${nodeCount} nodes   ${wf.description?.slice(0, 60) ?? ''}`);
    } catch {
      console.log(`  ${file.padEnd(25)} (invalid)`);
    }
  }
}

function cmdInspect(): void {
  const workflowName = args[1];
  if (!workflowName) {
    console.error('Usage: lattice inspect <workflow>');
    process.exit(1);
  }

  const latticeRoot = findLatticeRoot();
  const wfPath = resolveWorkflowPath(workflowName, latticeRoot);
  const wf = loadWorkflow(wfPath);
  const layers = buildExecutionLayers(wf);

  console.log(`Workflow: ${wf.name} v${wf.version}`);
  console.log(`Description: ${wf.description}`);
  console.log('');

  // Inputs
  if (Object.keys(wf.inputs).length > 0) {
    console.log('Inputs:');
    for (const [name, spec] of Object.entries(wf.inputs)) {
      const req = spec.required ? 'required' : `default: ${spec.default ?? 'none'}`;
      console.log(`  --${name} (${spec.type}, ${req})`);
    }
    console.log('');
  }

  // Execution plan
  console.log(`Execution plan (${layers.length} layers, ${Object.keys(wf.nodes).length} nodes):\n`);
  for (const layer of layers) {
    const parallel = layer.nodeIds.length > 1 ? ' (parallel)' : '';
    console.log(`  Layer ${layer.index}${parallel}:`);
    for (const id of layer.nodeIds) {
      const node = wf.nodes[id];
      const deps = node.depends_on?.length ? ` <- [${node.depends_on.join(', ')}]` : '';
      const checkpoint = node.checkpoint?.state_key ? ` @ ${node.checkpoint.state_key}` : '';
      console.log(`    ${id} [${node.type}]${deps}${checkpoint}`);
    }
  }
}

function cmdCoherence(): void {
  const flags = parseArgs();
  const cwd = process.cwd();
  const stateDir = resolve(cwd, '.lattice/cycle-state');

  if (!existsSync(stateDir)) {
    console.error(`No cycle state directory at ${stateDir}`);
    process.exit(1);
  }

  // Reconcile state against git FIRST — always derive truth before analysis
  const rawTopics = loadPortfolioState(stateDir, cwd);
  const recon = reconcileStates(rawTopics, cwd, true); // write=true, fix stale states
  const corrections = recon.filter(r => r.action === 'corrected');
  if (corrections.length > 0) {
    console.log(formatReconciliation(recon));
    console.log('');
  }

  // Re-load after corrections
  const topics = loadPortfolioState(stateDir, cwd);

  if (topics.length === 0) {
    console.log('No active topics found.');
    return;
  }

  const report = checkCoherence(topics);
  console.log(formatReport(report));

  // If a specific topic was asked about, show its safety
  const topic = flags['topic'] ?? args[1];
  if (topic) {
    const safety = isTopicSafe(topic, report);
    console.log('');
    console.log(`TOPIC CHECK: ${topic}`);
    console.log('-'.repeat(70));
    if (safety.safe) {
      console.log('  SAFE to advance. No blocking conflicts.');
    } else {
      console.log(`  BLOCKED by ${safety.conflicts.length} conflict(s):`);
      for (const c of safety.conflicts) {
        console.log(`    [${c.severity}] ${c.type}: ${c.description.slice(0, 100)}`);
      }
    }
  }

  process.exit(report.conflicts.filter(c => c.severity === 'blocker').length > 0 ? 1 : 0);
}

function cmdStatus(): void {
  const cwd = process.cwd();
  const stateDir = resolve(cwd, '.lattice/cycle-state');

  if (!existsSync(stateDir)) {
    console.error(`No cycle state directory at ${stateDir}`);
    process.exit(1);
  }

  // Reconcile state against git FIRST
  const rawTopics = loadPortfolioState(stateDir, cwd);
  const recon = reconcileStates(rawTopics, cwd, true);
  const corrections = recon.filter(r => r.action === 'corrected');
  if (corrections.length > 0) {
    console.log(formatReconciliation(recon));
    console.log('');
  }

  const topics = loadPortfolioState(stateDir, cwd);

  if (topics.length === 0) {
    console.log('No active topics found.');
    return;
  }

  // Group by phase
  const byPhase: Record<string, typeof topics> = {};
  for (const t of topics) {
    const phase = t.phase || 'unknown';
    if (!byPhase[phase]) byPhase[phase] = [];
    byPhase[phase].push(t);
  }

  const phaseOrder = ['research', 'research-complete', 'blueprint', 'blueprint-complete', 'build', 'spike', 'bugfix', 'building', 'unknown'];

  console.log('PORTFOLIO STATUS');
  console.log('='.repeat(70));
  console.log(`Active topics: ${topics.length}`);
  console.log('');

  for (const phase of phaseOrder) {
    const phaseTopics = byPhase[phase];
    if (!phaseTopics) continue;

    console.log(`${phase.toUpperCase()} (${phaseTopics.length})`);
    console.log('-'.repeat(70));

    for (const t of phaseTopics) {
      const activeSFs = t.scienceFlags.filter(sf => sf.scope === 'active').length;
      const brkCount = t.breaks.length;
      const subs = t.subsystems.length > 0 ? `[${t.subsystems.slice(0, 6).join(',')}]` : '';
      const flags: string[] = [];

      // Read cost from state file
      const topicCost = readTopicCostFromFile(t.stateFile);
      if (topicCost > 0) flags.push(`$${topicCost.toFixed(2)}`);

      if (activeSFs > 0) flags.push(`SF:${activeSFs}`);
      if (brkCount > 0) flags.push(`BRK:${brkCount}`);
      if (t.prerequisites.length > 0) flags.push(`prereq:${t.prerequisites.join(',')}`);
      const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';

      console.log(`  ${t.topic.padEnd(45)} ${t.currentStep.padEnd(16)} ${subs}${flagStr}`);
    }
    console.log('');
  }

  // Run coherence and show summary
  const report = checkCoherence(topics);
  const blockers = report.conflicts.filter(c => c.severity === 'blocker');
  const warnings = report.conflicts.filter(c => c.severity === 'warning');

  if (blockers.length > 0 || warnings.length > 0) {
    console.log(`COHERENCE: ${blockers.length} blockers, ${warnings.length} warnings`);
    console.log('Run `lattice coherence` for details.');
  } else {
    console.log(`COHERENCE: clean`);
  }

  if (report.safe.length > 0) {
    console.log(`READY TO ADVANCE: ${report.safe.join(', ')}`);
  }
}

async function cmdAutopilot(): Promise<void> {
  const flags = parseArgs();
  const cwd = process.cwd();
  const latticeRoot = findLatticeRoot();
  const dryRun = 'dry-run' in flags;
  const singlePass = !('loop' in flags);
  const maxAdvance = parseInt(flags['max'] ?? '3', 10);
  const filter = flags['filter'] ?? undefined;

  const adapter = new CliAdapter();

  console.log('Lattice Autopilot v0.1.0');
  console.log(`CWD: ${cwd}`);
  console.log(`Lattice: ${latticeRoot}`);
  console.log(`Mode: ${singlePass ? 'single pass' : 'continuous loop'}`);
  console.log(`Max advance per loop: ${maxAdvance}`);
  if (filter) console.log(`Filter: "${filter}"`);
  if (dryRun) console.log('DRY RUN — no workflows will execute');
  console.log('');

  const result = await runAutopilot({
    cwd,
    latticeRoot,
    adapter,
    maxAdvancePerLoop: maxAdvance,
    dryRun,
    singlePass,
    filter,
  });

  process.exit(result.topicsFailed.length > 0 ? 1 : 0);
}

// ── E2E Gate ───────────────────────────────────────────────

function cmdE2E(): void {
  const subcommand = args[1]; // 'run', 'classify', or undefined

  // Show help before checking config
  if (!subcommand || (subcommand !== 'run' && subcommand !== 'classify')) {
    console.log('Usage:');
    console.log('  lattice e2e run [--base main]       Full E2E gate: classify, compare branches, write result');
    console.log('  lattice e2e classify [--base main]   Testability classification only');
    console.log('');
    console.log('Exit codes: 0=pass, 1=fail, 2=skip (code_review_only or no config)');
    console.log('Config:     .lattice/e2e.yaml (see scaffold/.lattice/e2e.yaml for template)');
    process.exit(subcommand ? 1 : 0);
  }

  const flags = parseArgs();
  const cwd = process.cwd();
  const baseBranch = flags['base'] ?? undefined;

  const config = loadE2EConfig(cwd);
  if (!config) {
    console.log('No .lattice/e2e.yaml found -- E2E gate not configured for this project.');
    console.log('Copy scaffold/.lattice/e2e.yaml to .lattice/e2e.yaml and customize.');
    process.exit(2); // skip
  }

  const effectiveBase = baseBranch ?? config.base_branch;

  switch (subcommand) {
    case 'classify': {
      const mode = detectComparisonMode(effectiveBase, cwd);
      const changedFiles = getChangedFiles(effectiveBase, cwd, mode);
      const testability = classifyTestability(changedFiles, config);
      console.log(formatClassification(testability, changedFiles, mode));
      process.exit(testability.classification === 'e2e_testable' ? 0 : 2);
      break;
    }

    case 'run': {
      const result = runBranchComparison(config, cwd, baseBranch);
      writeE2EResult(result, cwd);
      console.log(formatE2EResult(result));

      switch (result.verdict) {
        case 'pass': process.exit(0); break;
        case 'fail': process.exit(1); break;
        case 'skip': process.exit(2); break;
        case 'error': process.exit(1); break;
      }
      break;
    }
  }
}

// ── Cost report ──────────────────────────────────────────

function cmdCost(): void {
  const topic = args[1]; // optional: specific topic
  const cwd = process.cwd();
  const stateDir = resolve(cwd, '.lattice/cycle-state');

  if (!existsSync(stateDir)) {
    console.error(`No cycle state directory at ${stateDir}`);
    process.exit(1);
  }

  const files = readdirSync(stateDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  if (files.length === 0) {
    console.log('No topics found.');
    return;
  }

  // Collect cost data from all state files
  const costs: { topic: string; cost: Record<string, unknown> }[] = [];
  let grandTotalUSD = 0;

  for (const file of files) {
    const path = resolve(stateDir, file);
    try {
      const data = yaml.load(readFileSync(path, 'utf-8')) as Record<string, unknown>;
      const topicName = file.replace(/\.ya?ml$/, '');

      if (topic && topicName !== topic) continue;

      const cost = data?.['cost'] as Record<string, unknown> | undefined;
      if (cost && typeof cost['total_usd'] === 'number' && cost['total_usd'] > 0) {
        costs.push({ topic: topicName, cost });
        grandTotalUSD += cost['total_usd'] as number;
      }
    } catch { /* skip corrupt files */ }
  }

  if (costs.length === 0) {
    console.log(topic ? `No cost data for topic "${topic}".` : 'No cost data recorded yet.');
    return;
  }

  // Sort by cost descending
  costs.sort((a, b) => (b.cost['total_usd'] as number) - (a.cost['total_usd'] as number));

  console.log('COST REPORT');
  console.log('='.repeat(70));

  if (topic && costs.length === 1) {
    // Detailed single-topic view
    const c = costs[0].cost;
    console.log(`Topic: ${costs[0].topic}`);
    console.log(`Total: $${(c['total_usd'] as number).toFixed(4)}`);
    console.log(`Tokens: ${fmtK(c['total_input_tokens'] as number ?? 0)} in / ${fmtK(c['total_output_tokens'] as number ?? 0)} out`);
    if (c['last_run']) console.log(`Last run: ${c['last_run']}`);

    const nodes = c['nodes'] as Record<string, Record<string, unknown>> | undefined;
    if (nodes && Object.keys(nodes).length > 0) {
      console.log('');
      console.log('Per node:');
      const sorted = Object.entries(nodes).sort(
        (a, b) => ((b[1]['cost_usd'] as number) ?? 0) - ((a[1]['cost_usd'] as number) ?? 0)
      );
      for (const [nodeId, nc] of sorted) {
        const usd = (nc['cost_usd'] as number) ?? 0;
        const tok = ((nc['input_tokens'] as number) ?? 0) + ((nc['output_tokens'] as number) ?? 0);
        const dur = ((nc['duration_ms'] as number) ?? 0) / 1000;
        const model = nc['model'] ? `  ${nc['model']}` : '';
        console.log(`  ${nodeId.padEnd(30)} $${usd.toFixed(4)}  ${fmtK(tok)} tok  ${dur.toFixed(1)}s${model}`);
      }
    }
  } else {
    // Summary table across topics
    console.log(`${'Topic'.padEnd(45)} ${'Cost'.padStart(10)} ${'Tokens'.padStart(12)} ${'Last run'.padStart(20)}`);
    console.log('-'.repeat(70));

    for (const { topic: t, cost: c } of costs) {
      const usd = `$${(c['total_usd'] as number).toFixed(4)}`;
      const tok = fmtK(((c['total_input_tokens'] as number) ?? 0) + ((c['total_output_tokens'] as number) ?? 0));
      const lastRun = (c['last_run'] as string ?? '').slice(0, 10);
      console.log(`${t.padEnd(45)} ${usd.padStart(10)} ${tok.padStart(12)} ${lastRun.padStart(20)}`);
    }

    console.log('-'.repeat(70));
    console.log(`${'TOTAL'.padEnd(45)} ${('$' + grandTotalUSD.toFixed(4)).padStart(10)}`);
  }
}

function readTopicCostFromFile(stateFile: string): number {
  try {
    const data = yaml.load(readFileSync(stateFile, 'utf-8')) as Record<string, unknown>;
    const cost = data?.['cost'] as Record<string, unknown> | undefined;
    if (cost && typeof cost['total_usd'] === 'number') return cost['total_usd'];
  } catch { /* missing or corrupt */ }
  return 0;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Helpers ─────────────────────────────────────────────────

function duration(start: string, end?: string): string {
  if (!end) return 'in progress';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ── Dispatch ────────────────────────────────────────────────

switch (command) {
  case 'run':
    cmdRun().catch(err => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
    break;
  case 'validate':
    cmdValidate();
    break;
  case 'list':
    cmdList();
    break;
  case 'inspect':
    cmdInspect();
    break;
  case 'coherence':
    cmdCoherence();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'autopilot':
    cmdAutopilot().catch(err => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
    break;
  case 'e2e':
    cmdE2E();
    break;
  case 'cost':
    cmdCost();
    break;
  default:
    console.log('Lattice Executor v0.1.0\n');
    console.log('Commands:');
    console.log('  lattice run <workflow> --topic <topic> [--dry-run]');
    console.log('  lattice validate [workflow]');
    console.log('  lattice list');
    console.log('  lattice inspect <workflow>');
    console.log('  lattice status                           Portfolio overview + coherence summary');
    console.log('  lattice coherence [topic]                Full conflict analysis');
    console.log('  lattice autopilot [--dry-run] [--loop] [--max N] [--filter PATTERN]');
    console.log('                                           Advance safe topics, batch human decisions');
    console.log('  lattice e2e run [--base main]             Branch-comparison E2E testing gate');
    console.log('  lattice e2e classify [--base main]        Testability classification');
    console.log('  lattice cost [topic]                      Per-topic cost report');
    process.exit(command ? 1 : 0);
}
