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
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs as nodeParseArgs } from 'node:util';
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
import { formatCostSummary, readContextTelemetry, loadBudgetConfig } from './budget.js';
import { resyncProject, type ResyncResult } from './resync.js';
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

/**
 * Known boolean flags across all commands. node:util.parseArgs needs
 * type='boolean' for these so it doesn't consume the next positional as
 * the flag's value. Adding a new boolean flag? Append it here.
 */
const BOOLEAN_FLAGS = new Set([
  'dry-run',
  'force',
  'loop',
  'skip-reconcile',
]);

/**
 * Parse `args` (process.argv after the command) into a flat
 * Record<string, string>. Boolean flags map to 'true'. Unknown flags are
 * accepted as strings (cmdRun forwards arbitrary --<workflow-input>).
 *
 * Wraps node:util.parseArgs (Node 18.3+; stable since 20). Returning the
 * legacy Record<string, string> shape keeps every call-site (`'dry-run' in
 * flags`, `flags['max']`, `flags['topic']`, etc.) backwards-compatible.
 */
function parseArgs(): Record<string, string> {
  // Build option config: every BOOLEAN_FLAGS entry registered as boolean,
  // everything else treated as string. parseArgs in non-strict mode also
  // accepts options not listed here; for unregistered flags it will treat
  // the next non-flag token as a positional unless we mark it as string.
  // We pre-register every flag we know about plus give cmdRun a permissive
  // fallback by setting strict:false and scanning args ourselves first.
  const knownStringFlags = new Set<string>([
    'lattice-root', 'mode', 'topic', 'max', 'max-loops', 'filter', 'base', 'last', 'source',
  ]);

  // Pre-scan args to discover any --foo flag the caller passed that isn't
  // in our static lists. Treat them as string-typed so parseArgs consumes
  // the following token as the value (preserves cmdRun's pass-through
  // surface for arbitrary workflow inputs like --topic, --species, etc.).
  const dynamicStringFlags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2).split('=')[0];
    if (!name) continue;
    if (BOOLEAN_FLAGS.has(name) || knownStringFlags.has(name)) continue;
    dynamicStringFlags.add(name);
  }

  const options: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }> = {};
  for (const name of BOOLEAN_FLAGS) options[name] = { type: 'boolean' };
  for (const name of knownStringFlags) options[name] = { type: 'string' };
  for (const name of dynamicStringFlags) options[name] = { type: 'string' };

  let parsed: { values: Record<string, string | boolean | undefined> };
  try {
    parsed = nodeParseArgs({
      args,
      options,
      strict: false,
      allowPositionals: true,
    }) as { values: Record<string, string | boolean | undefined> };
  } catch (err) {
    // parseArgs throws on malformed input (e.g. --flag= with no value when
    // type=string). Surface a clear error rather than silently dropping.
    throw new Error(
      `Failed to parse CLI arguments: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.values)) {
    if (value === undefined) continue;
    // Boolean true -> 'true' string (legacy shape); false flags simply absent.
    result[key] = value === true ? 'true' : value === false ? 'false' : String(value);
  }
  return result;
}

// ── Report persistence ──────────────────────────────────────
//
// CLI commands that produce substantive analysis (coherence, status,
// autopilot) tee their stdout to a markdown file under .lattice/ so the
// output is durable across terminal sessions and readable from a
// follow-on Claude Code session. Without this, anything that scrolls past
// the PowerShell buffer is lost.
//
// Conventions:
//   - .lattice/coherence-report.md      overwritten each `lattice coherence`
//   - .lattice/status-report.md         overwritten each `lattice status`
//   - .lattice/autopilot-runs/<ts>.md   one file per `lattice autopilot` run
function writeReport(cwd: string, relPath: string, content: string): void {
  try {
    const fullPath = resolve(cwd, '.lattice', relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  } catch (err) {
    // Persistence is best-effort -- never fail a command because we
    // couldn't write the report file.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[warn] could not write report .lattice/${relPath}: ${msg}`);
  }
}

/**
 * Build a tee-logger that writes each line both to stdout and to an
 * accumulator. Use the accumulator to assemble the report file at the end.
 */
function makeTeeLogger(out: string[]): (line: string) => void {
  return (line: string) => {
    console.log(line);
    out.push(line);
  };
}

/**
 * Filesystem-safe ISO-ish timestamp for filenames. Replaces `:` and `.`
 * (reserved on Windows) with `-`.
 */
function fsTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
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

  // HIGH-6 fix from the 2026-05-04 audit. Bash nodes execute with template
  // substitution against `inputs`, including `{{inputs.topic}}` -- those
  // strings land in `execSync(command)` which runs through the shell. A
  // topic ID containing shell metacharacters (`$()`, backticks, semicolons,
  // newlines) would inject arbitrary commands. Surface is small (workflow
  // inputs are typically authored locally), but autopilot reads topic IDs
  // from TODO.md and cycle-state filenames -- both writable by any skill
  // -- so a malicious or careless name could leak through.
  //
  // Validate string-typed inputs against a conservative allowlist:
  // alphanumerics, underscore, dash, dot, slash. This is the same regex
  // the audit recommended.
  const TOPIC_RE = /^[A-Za-z0-9_./-]+$/;
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'string' && !TOPIC_RE.test(value)) {
      console.error(
        `Workflow input '${key}' contains characters outside the safe set ` +
        `(allowlist: alphanumerics, _, -, ., /). Value: ${JSON.stringify(value)}. ` +
        `Refusing to run -- the value would be substituted into bash node ` +
        `commands without escaping. Rename the topic / sanitize the value, ` +
        `then retry.`,
      );
      process.exit(2);
    }
  }

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
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .filter(f => !NON_WORKFLOW_YAMLS.has(f));
    let total = 0;
    for (const file of files) {
      validateOne(resolve(dir, file));
      total++;
    }
    console.log(`\n${total} workflows validated.`);
  }
}

/**
 * YAML files in workflows/ that are NOT workflow definitions and should be
 * skipped by validate/list/inspect. Currently: verdict-enums.yaml (registry
 * data file consumed by loader.ts; not a workflow itself).
 */
const NON_WORKFLOW_YAMLS = new Set(['verdict-enums.yaml']);

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

  const files = readdirSync(dir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .filter(f => !NON_WORKFLOW_YAMLS.has(f));

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
  const skipReconcile = 'skip-reconcile' in flags;
  // MEDIUM-8 fix from the 2026-05-04 audit: `lattice coherence` looked
  // read-only but called reconcileStates(write=true) unconditionally, which
  // silently overwrote cycle-state files based on git-log heuristics. Now
  // default to read-only; pass `--reconcile` to opt into mutation.
  const reconcileMutates = 'reconcile' in flags;

  if (!existsSync(stateDir)) {
    console.error(`No cycle state directory at ${stateDir}`);
    process.exit(1);
  }

  // Tee output to .lattice/coherence-report.md so the report survives
  // PowerShell scrollback truncation and is readable from a follow-on
  // Claude Code session.
  const out: string[] = [];
  const log = makeTeeLogger(out);
  out.push(`# Coherence report -- ${new Date().toISOString()}`);
  out.push('');

  // Reconcile state against git FIRST — always derive truth before analysis.
  // --skip-reconcile: caller already ran `lattice status` (or equivalent) in
  // this session and state is known fresh; skip the redundant git scan.
  let topics;
  if (skipReconcile) {
    topics = loadPortfolioState(stateDir, cwd);
  } else {
    const rawTopics = loadPortfolioState(stateDir, cwd);
    const recon = reconcileStates(rawTopics, cwd, reconcileMutates); // write only when --reconcile
    const corrections = recon.filter(r => r.action === 'corrected');
    if (corrections.length > 0) {
      log(formatReconciliation(recon));
      log('');
    }

    // Re-load after corrections
    topics = loadPortfolioState(stateDir, cwd);
  }

  if (topics.length === 0) {
    log('No active topics found.');
    writeReport(cwd, 'coherence-report.md', out.join('\n') + '\n');
    return;
  }

  const report = checkCoherence(topics);
  log(formatReport(report));

  // If a specific topic was asked about, show its safety.
  // args[1] may be a --flag (e.g. --skip-reconcile); only treat as topic
  // if it doesn't start with '--'.
  const positional = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
  const topic = flags['topic'] ?? positional;
  if (topic) {
    const safety = isTopicSafe(topic, report);
    log('');
    log(`TOPIC CHECK: ${topic}`);
    log('-'.repeat(70));
    if (safety.safe) {
      log('  SAFE to advance. No blocking conflicts.');
    } else {
      log(`  BLOCKED by ${safety.conflicts.length} conflict(s):`);
      for (const c of safety.conflicts) {
        log(`    [${c.severity}] ${c.type}: ${c.description.slice(0, 100)}`);
      }
    }
  }

  writeReport(cwd, 'coherence-report.md', out.join('\n') + '\n');
  process.exit(report.conflicts.filter(c => c.severity === 'blocker').length > 0 ? 1 : 0);
}

function cmdStatus(): void {
  const flags = parseArgs();
  const cwd = process.cwd();
  const stateDir = resolve(cwd, '.lattice/cycle-state');
  // MEDIUM-8 fix: see cmdCoherence above. `lattice status` was the same
  // silent-mutation path. Default read-only; --reconcile to opt in.
  const reconcileMutates = 'reconcile' in flags;

  if (!existsSync(stateDir)) {
    console.error(`No cycle state directory at ${stateDir}`);
    process.exit(1);
  }

  // Tee output to .lattice/status-report.md (see writeReport docstring).
  const out: string[] = [];
  const log = makeTeeLogger(out);
  out.push(`# Portfolio status -- ${new Date().toISOString()}`);
  out.push('');

  // Reconcile state against git FIRST
  const rawTopics = loadPortfolioState(stateDir, cwd);
  const recon = reconcileStates(rawTopics, cwd, reconcileMutates);
  const corrections = recon.filter(r => r.action === 'corrected');
  if (corrections.length > 0) {
    log(formatReconciliation(recon));
    log('');
  }

  const topics = loadPortfolioState(stateDir, cwd);

  if (topics.length === 0) {
    log('No active topics found.');
    writeReport(cwd, 'status-report.md', out.join('\n') + '\n');
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

  log('PORTFOLIO STATUS');
  log('='.repeat(70));
  log(`Active topics: ${topics.length}`);
  log('');

  for (const phase of phaseOrder) {
    const phaseTopics = byPhase[phase];
    if (!phaseTopics) continue;

    log(`${phase.toUpperCase()} (${phaseTopics.length})`);
    log('-'.repeat(70));

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

      log(`  ${t.topic.padEnd(45)} ${t.currentStep.padEnd(16)} ${subs}${flagStr}`);
    }
    log('');
  }

  // Run coherence and show summary
  const report = checkCoherence(topics);
  const blockers = report.conflicts.filter(c => c.severity === 'blocker');
  const warnings = report.conflicts.filter(c => c.severity === 'warning');

  if (blockers.length > 0 || warnings.length > 0) {
    log(`COHERENCE: ${blockers.length} blockers, ${warnings.length} warnings`);
    log('Run `lattice coherence` for details.');
  } else {
    log(`COHERENCE: clean`);
  }

  if (report.safe.length > 0) {
    log(`READY TO ADVANCE: ${report.safe.join(', ')}`);
  }

  writeReport(cwd, 'status-report.md', out.join('\n') + '\n');
}

/**
 * CliAdapter that also accumulates messages so cmdAutopilot can persist
 * the run transcript to .lattice/autopilot-runs/<ts>.md after the loop
 * finishes. Approval prompts are not transcribed (they're interactive
 * input/output, not analysis output).
 */
class TeeCliAdapter extends CliAdapter {
  public messages: string[] = [];
  override async sendMessage(message: string): Promise<void> {
    this.messages.push(message);
    await super.sendMessage(message);
  }
}

async function cmdAutopilot(): Promise<void> {
  const flags = parseArgs();
  const cwd = process.cwd();
  const latticeRoot = findLatticeRoot();
  const dryRun = 'dry-run' in flags;
  const singlePass = !('loop' in flags);
  const maxAdvance = parseInt(flags['max'] ?? '3', 10);
  const maxLoops = parseInt(flags['max-loops'] ?? '50', 10);
  const filter = flags['filter'] ?? undefined;
  const sourceRaw = flags['source'] ?? 'both';
  if (!['topics', 'todo', 'both'].includes(sourceRaw)) {
    console.error(`Invalid --source value "${sourceRaw}". Allowed: topics, todo, both.`);
    process.exit(2);
  }
  const source = sourceRaw as 'topics' | 'todo' | 'both';

  const adapter = new TeeCliAdapter();

  // Build a banner that mirrors what the user sees on screen, so the
  // persisted transcript is self-contained (not just adapter messages).
  // Uses makeTeeLogger for consistency with cmdCoherence/cmdStatus.
  const banner: string[] = [];
  const bannerLog = makeTeeLogger(banner);
  bannerLog(`# Autopilot run -- ${new Date().toISOString()}`);
  bannerLog('');
  bannerLog('Lattice Autopilot v0.1.0');
  bannerLog(`CWD: ${cwd}`);
  bannerLog(`Lattice: ${latticeRoot}`);
  bannerLog(`Mode: ${singlePass ? 'single pass' : 'continuous loop'}`);
  bannerLog(`Max advance per loop: ${maxAdvance}`);
  if (filter) bannerLog(`Filter: "${filter}"`);
  if (source !== 'both') bannerLog(`Source: ${source}`);
  if (dryRun) bannerLog('DRY RUN -- no workflows will execute');
  bannerLog('');

  const result = await runAutopilot({
    cwd,
    latticeRoot,
    adapter,
    maxAdvancePerLoop: maxAdvance,
    maxLoops,
    dryRun,
    singlePass,
    filter,
    source,
  });

  // Persist the full transcript: banner + everything sent through the
  // adapter. One file per run -- timestamped so concurrent / repeated
  // invocations don't clobber each other.
  const transcript = [...banner, ...adapter.messages].join('\n') + '\n';
  writeReport(cwd, `autopilot-runs/${fsTimestamp()}.md`, transcript);

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

// ── Context-rot telemetry (LIT-09) ──────────────────────────

function cmdContext(): void {
  const cwd = process.cwd();
  const lastIdx = args.indexOf('--last');
  const lastN = lastIdx >= 0 && args[lastIdx + 1]
    ? Math.max(1, parseInt(args[lastIdx + 1], 10) || 50)
    : 50;

  const entries = readContextTelemetry(cwd, lastN);
  if (entries.length === 0) {
    console.log('No context telemetry yet. Run a workflow with `context:` configured in .lattice/budget.yaml.');
    return;
  }

  const config = loadBudgetConfig(cwd)?.context;
  console.log('CONTEXT-ROT TELEMETRY');
  console.log('='.repeat(80));
  if (config) {
    console.log(`Window: ${fmtK(config.windowSize)} tok | warn ${pct(config.warnThreshold ?? 0.6)} | block ${pct(config.blockThreshold ?? 0.8)}`);
  } else {
    console.log('No context config in .lattice/budget.yaml — utilization computed against zero (treat as advisory).');
  }
  console.log('');
  console.log(`Showing last ${entries.length} entries (most recent last)`);
  console.log('');

  let peak = 0;
  let warns = 0;
  let blocks = 0;
  for (const e of entries) {
    if (e.utilization > peak) peak = e.utilization;
    if (e.level === 'warn') warns++;
    if (e.level === 'block') blocks++;
    const tag = e.level === 'block' ? '[ROT]' : e.level === 'warn' ? '[WARN]' : '     ';
    const ts = e.ts.split('T')[1]?.slice(0, 8) ?? e.ts;
    console.log(`  ${tag} ${ts}  ${e.workflow.padEnd(20)} ${e.node.padEnd(25)} ${pct(e.utilization).padStart(5)}  ${fmtK(e.inputTokens)} tok in`);
  }

  console.log('');
  console.log(`Peak utilization: ${pct(peak)}  |  warnings: ${warns}  |  rot-blocks: ${blocks}`);
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// ── Helpers ─────────────────────────────────────────────────

function duration(start: string, end?: string): string {
  if (!end) return 'in progress';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ── resync command ──────────────────────────────────────────

/**
 * CLI wrapper around `resyncProject` (in resync.ts). Exit codes:
 *   0 — all files rendered cleanly
 *   1 — one or more TemplateIncludeError; per-file errors printed to stderr
 *   2 — usage error (missing arg, project root doesn't exist, no commands dir)
 */
function cmdResync(): void {
  const projectRoot = args[1];
  if (!projectRoot) {
    console.error('Usage: lattice resync <project-root>');
    process.exit(2);
  }
  const root = resolve(projectRoot);
  if (!existsSync(root)) {
    console.error(`Project root does not exist: ${root}`);
    process.exit(2);
  }

  let result: ResyncResult;
  try {
    result = resyncProject(root);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  if (!result.hasManifest) {
    console.error(`WARNING: ${root}/lattice-project.toml not found; rendered with empty manifest. Tokens became <<UNDEFINED:...>> sentinels.`);
  }

  const strays = result.strayTemplateFiles ?? [];
  console.log(`resync: ${result.rendered} rendered, ${result.unchanged} already-template-free, ${result.errors.length} errors, ${result.sentinelFiles.length} with UNDEFINED sentinels, ${strays.length} with stray templates`);

  if (result.sentinelFiles.length > 0) {
    console.error('Files with UNDEFINED sentinels (manifest key not defined):');
    for (const f of result.sentinelFiles) {
      const rel = f.startsWith(root) ? f.slice(root.length + 1) : f;
      console.error(`  ${rel}`);
    }
  }

  if (strays.length > 0) {
    console.error('Files with stray {{...}} template syntax (next resync will mis-substitute -- see lattice-project-spec.md §3.1 Rule 5):');
    for (const f of strays) {
      const rel = f.startsWith(root) ? f.slice(root.length + 1) : f;
      console.error(`  ${rel}`);
    }
  }

  if (result.errors.length > 0) {
    console.error('\nFiles that failed to render:');
    for (const { file, reason } of result.errors) {
      const rel = file.startsWith(root) ? file.slice(root.length + 1) : file;
      console.error(`  ${rel}: ${reason}`);
    }
    process.exit(1);
  }

  process.exit(0);
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
  case 'context':
    cmdContext();
    break;
  case 'resync':
    cmdResync();
    break;
  default:
    console.log('Lattice Executor v0.1.0\n');
    console.log('Commands:');
    console.log('  lattice run <workflow> --topic <topic> [--dry-run]');
    console.log('  lattice validate [workflow]');
    console.log('  lattice list');
    console.log('  lattice inspect <workflow>');
    console.log('  lattice status                           Portfolio overview + coherence summary');
    console.log('  lattice coherence [topic] [--skip-reconcile]');
  console.log('                                           Full conflict analysis; --skip-reconcile when status was just run');
    console.log('  lattice autopilot [--dry-run] [--loop] [--max N] [--max-loops N] [--filter PATTERN]');
    console.log('                                           Advance safe topics, batch human decisions');
    console.log('                                           --max-loops caps outer-loop iterations (default 50, LIT-10)');
    console.log('  lattice e2e run [--base main]             Branch-comparison E2E testing gate');
    console.log('  lattice e2e classify [--base main]        Testability classification');
    console.log('  lattice cost [topic]                      Per-topic cost report');
    console.log('  lattice context [--last N]                Context-rot telemetry (LIT-09)');
    process.exit(command ? 1 : 0);
}
