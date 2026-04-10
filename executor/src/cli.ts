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
import { readdirSync, existsSync } from 'node:fs';
import { loadWorkflow, resolveWorkflowPath } from './loader.js';
import { buildExecutionLayers } from './dag.js';
import { executeWorkflow } from './engine.js';
import { CliAdapter } from './nodes.js';
import { loadPortfolioState, checkCoherence, isTopicSafe, formatReport } from './coherence.js';

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

  const topics = loadPortfolioState(stateDir);

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

  const topics = loadPortfolioState(stateDir);

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
      const sfCount = t.scienceFlags.filter(sf => !sf.resolved).length;
      const brkCount = t.breaks.length;
      const subs = t.subsystems.length > 0 ? `[${t.subsystems.slice(0, 6).join(',')}]` : '';
      const flags: string[] = [];
      if (sfCount > 0) flags.push(`SF:${sfCount}`);
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
  default:
    console.log('Lattice Executor v0.1.0\n');
    console.log('Commands:');
    console.log('  lattice run <workflow> --topic <topic> [--dry-run]');
    console.log('  lattice validate [workflow]');
    console.log('  lattice list');
    console.log('  lattice inspect <workflow>');
    console.log('  lattice status                           Portfolio overview + coherence summary');
    console.log('  lattice coherence [topic]                Full conflict analysis');
    process.exit(command ? 1 : 0);
}
