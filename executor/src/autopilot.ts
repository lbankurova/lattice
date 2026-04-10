/**
 * Autopilot — continuous portfolio advancement loop.
 *
 * Reads all cycle states, runs coherence check, advances safe topics
 * through their full lifecycle (no phase-transition gates), collects
 * STOP conditions into a human decision batch.
 *
 * Human intervention ONLY for:
 *   - SCIENCE-FLAG (analytical output changes)
 *   - Persistent FLAWED (genuine scientific disagreement)
 *   - BREAKS (system integrity)
 *   - Architect REJECT (fundamental approach wrong)
 *   - Coherence conflicts (cross-topic subsystem contention)
 *
 * Everything else is autonomous:
 *   - Classification (auto-decide: full/spike/bugfix)
 *   - Phase transitions (research -> blueprint -> build seamlessly)
 *   - CONDITIONAL findings (auto-accept)
 *   - Architect SIMPLIFY (auto-apply)
 *   - Bikeshed detection (auto-side with R1)
 *   - Commit (auto when review passes)
 */

import { resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { PlatformAdapter, WorkflowRun } from './types.js';
import { loadPortfolioState, checkCoherence, isTopicSafe, formatReport } from './coherence.js';
import type { TopicState, Conflict, CoherenceReport } from './coherence.js';
import { loadWorkflow, resolveWorkflowPath } from './loader.js';
import { executeWorkflow } from './engine.js';
import { reconcileStates, formatReconciliation } from './reconcile.js';

// ── Types ───────────────────────────────────────────────────

export interface AutopilotOptions {
  /** Project working directory */
  cwd: string;
  /** Lattice framework root */
  latticeRoot: string;
  /** Platform adapter */
  adapter: PlatformAdapter;
  /** Maximum topics to advance per loop iteration */
  maxAdvancePerLoop: number;
  /** Dry run — report what would be done without executing */
  dryRun: boolean;
  /** Filter — only advance topics matching this pattern (substring match) */
  filter?: string;
  /** Single pass — run once and exit (vs continuous loop) */
  singlePass: boolean;
}

export interface HumanDecision {
  topic: string;
  type: 'science-flag' | 'persistent-flawed' | 'breaks' | 'architect-reject' | 'coherence-conflict';
  description: string;
  options: { id: string; label: string }[];
}

export interface AutopilotResult {
  loopsCompleted: number;
  topicsAdvanced: string[];
  topicsFailed: string[];
  pendingDecisions: HumanDecision[];
  coherenceReport: CoherenceReport;
}

// ── Phase-to-workflow mapping ───────────────────────────────

interface AdvanceAction {
  workflow: string;
  description: string;
}

function getAdvanceAction(topic: TopicState): AdvanceAction | null {
  switch (topic.phase) {
    case 'research':
      return { workflow: 'research-cycle', description: 'Resume research' };

    case 'research-complete':
      return { workflow: 'blueprint-cycle', description: 'Start blueprint (research validated)' };

    case 'blueprint':
      return { workflow: 'blueprint-cycle', description: 'Resume blueprint' };

    case 'blueprint-complete':
      return { workflow: 'build-cycle', description: 'Start build (blueprint validated)' };

    case 'build':
      return { workflow: 'build-cycle', description: 'Resume build' };

    case 'spike':
      return { workflow: 'spike-cycle', description: 'Resume spike' };

    case 'bugfix':
      return { workflow: 'bug-fix-cycle', description: 'Resume bug fix' };

    // New topics (no state file — need classification)
    // These come in with empty/undefined phase
    case '':
    case 'undefined':
    case '?':
      return { workflow: 'cycle', description: 'New topic — classify and dispatch' };

    default:
      return null; // Unknown phase or already complete
  }
}

// ── Main loop ───────────────────────────────────────────────

/**
 * Run the autopilot loop. Returns when either:
 * - singlePass is true (one iteration)
 * - all topics are either completed, blocked, or need human decisions
 * - no progress was made in the last iteration (steady state)
 */
export async function runAutopilot(opts: AutopilotOptions): Promise<AutopilotResult> {
  const { cwd, latticeRoot, adapter, maxAdvancePerLoop, dryRun, singlePass } = opts;
  const stateDir = resolve(cwd, '.lattice/cycle-state');

  const result: AutopilotResult = {
    loopsCompleted: 0,
    topicsAdvanced: [],
    topicsFailed: [],
    pendingDecisions: [],
    coherenceReport: {
      timestamp: new Date().toISOString(),
      activeTopics: 0,
      conflicts: [],
      safe: [],
      blocked: [],
      needsHuman: [],
      subsystemHeatmap: {},
    },
  };

  let madeProgress = true;

  while (madeProgress) {
    madeProgress = false;
    result.loopsCompleted++;

    await adapter.sendMessage(`\n${'='.repeat(70)}`);
    await adapter.sendMessage(`AUTOPILOT — Loop ${result.loopsCompleted}`);
    await adapter.sendMessage('='.repeat(70));

    // 1. Load portfolio state with deep doc extraction
    if (!existsSync(stateDir)) {
      await adapter.sendMessage('No cycle state directory. Nothing to do.');
      break;
    }

    // 1a. Reconcile state against git — derive truth before analysis
    const rawTopics = loadPortfolioState(stateDir, cwd);
    const recon = reconcileStates(rawTopics, cwd, true);
    const corrections = recon.filter(r => r.action === 'corrected');
    if (corrections.length > 0) {
      await adapter.sendMessage(`Reconciled ${corrections.length} stale state(s):`);
      for (const c of corrections) {
        await adapter.sendMessage(`  ${c.topic}: ${c.stateBefore} -> ${c.stateAfter}`);
      }
    }

    // 1b. Re-load after corrections
    const topics = loadPortfolioState(stateDir, cwd);
    if (topics.length === 0) {
      await adapter.sendMessage('No active topics.');
      break;
    }

    // 2. Run coherence check
    const report = checkCoherence(topics);
    result.coherenceReport = report;

    await adapter.sendMessage(`\nActive: ${report.activeTopics} | Safe: ${report.safe.length} | Blocked: ${report.blocked.length} | Conflicts: ${report.conflicts.filter(c => c.severity === 'blocker').length}`);

    // 3. Identify advanceable topics (filtered if --filter provided)
    const advanceable: { topic: TopicState; action: AdvanceAction }[] = [];

    for (const topicState of topics) {
      // Apply filter if provided
      if (opts.filter && !topicState.topic.includes(opts.filter)) continue;

      const safety = isTopicSafe(topicState.topic, report);
      if (!safety.safe) continue;

      const action = getAdvanceAction(topicState);
      if (!action) continue;

      advanceable.push({ topic: topicState, action });
    }

    if (advanceable.length === 0) {
      await adapter.sendMessage('\nNo topics can be advanced. Autopilot pausing.');

      // Collect pending decisions from blocked topics
      collectPendingDecisions(topics, report, result);
      break;
    }

    // 4. Show what we're about to do
    const batch = advanceable.slice(0, maxAdvancePerLoop);

    await adapter.sendMessage(`\nAdvancing ${batch.length} topic(s):`);
    for (const { topic, action } of batch) {
      await adapter.sendMessage(`  ${topic.topic} (${topic.phase}) -> ${action.workflow}: ${action.description}`);
    }

    if (dryRun) {
      await adapter.sendMessage('\n[DRY RUN] Would advance the above topics.');
      for (const { topic } of batch) {
        result.topicsAdvanced.push(topic.topic);
      }
      // Still collect decisions for blocked topics
      collectPendingDecisions(topics, report, result);
      break;
    }

    // 5. Execute topics sequentially (parallel in Phase 2+)
    for (const { topic, action } of batch) {
      await adapter.sendMessage(`\n--- Advancing: ${topic.topic} via ${action.workflow} ---`);

      try {
        const wfPath = resolveWorkflowPath(action.workflow, latticeRoot);
        const wf = loadWorkflow(wfPath);

        const inputs: Record<string, string | number | boolean> = {
          topic: topic.topic,
        };

        const run = await executeWorkflow(wf, inputs, {
          cwd,
          adapter,
          latticeRoot,
          skipCoherence: true, // Already checked at autopilot level
        });

        if (run.status === 'completed') {
          result.topicsAdvanced.push(topic.topic);
          madeProgress = true;
          await adapter.sendMessage(`  ${topic.topic}: COMPLETED`);
        } else if (run.status === 'paused') {
          // Hit a human-required gate inside the workflow
          await adapter.sendMessage(`  ${topic.topic}: PAUSED (needs human decision)`);
          collectWorkflowDecisions(topic.topic, run, result);
        } else {
          result.topicsFailed.push(topic.topic);
          await adapter.sendMessage(`  ${topic.topic}: FAILED (${run.status})`);
        }
      } catch (err) {
        result.topicsFailed.push(topic.topic);
        await adapter.sendMessage(`  ${topic.topic}: ERROR — ${err instanceof Error ? err.message : err}`);
      }

      // 6. Re-run coherence after each advancement
      // New findings from this topic may create conflicts for the next
      const updatedTopics = loadPortfolioState(stateDir, cwd);
      const updatedReport = checkCoherence(updatedTopics);
      const newBlockers = updatedReport.conflicts.filter(c => c.severity === 'blocker').length;
      const prevBlockers = report.conflicts.filter(c => c.severity === 'blocker').length;

      if (newBlockers > prevBlockers) {
        await adapter.sendMessage(`\n  COHERENCE: ${newBlockers - prevBlockers} new blocker(s) detected after advancing ${topic.topic}.`);
        // Re-evaluate remaining batch against updated coherence
        // (the outer loop will re-check on next iteration)
      }
    }

    // 7. Collect decisions from blocked topics
    const finalTopics = loadPortfolioState(stateDir, cwd);
    const finalReport = checkCoherence(finalTopics);
    result.coherenceReport = finalReport;
    collectPendingDecisions(finalTopics, finalReport, result);

    if (singlePass) break;
  }

  // 8. Present human decision batch
  if (result.pendingDecisions.length > 0) {
    await adapter.sendMessage(`\n${'='.repeat(70)}`);
    await adapter.sendMessage(`HUMAN DECISIONS NEEDED: ${result.pendingDecisions.length}`);
    await adapter.sendMessage('='.repeat(70));

    for (const decision of result.pendingDecisions) {
      await adapter.sendMessage(`\n[${decision.type}] ${decision.topic}`);
      await adapter.sendMessage(`  ${decision.description}`);
    }
  }

  // Final summary
  await adapter.sendMessage(`\n${'='.repeat(70)}`);
  await adapter.sendMessage('AUTOPILOT SUMMARY');
  await adapter.sendMessage('='.repeat(70));
  await adapter.sendMessage(`Loops: ${result.loopsCompleted}`);
  await adapter.sendMessage(`Advanced: ${result.topicsAdvanced.length} (${result.topicsAdvanced.join(', ') || 'none'})`);
  await adapter.sendMessage(`Failed: ${result.topicsFailed.length} (${result.topicsFailed.join(', ') || 'none'})`);
  await adapter.sendMessage(`Pending decisions: ${result.pendingDecisions.length}`);
  await adapter.sendMessage(`Blocked topics: ${result.coherenceReport.blocked.length}`);

  return result;
}

// ── Decision collection ─────────────────────────────────────

/**
 * Collect pending human decisions from blocked topics in the coherence report.
 */
function collectPendingDecisions(
  topics: TopicState[],
  report: CoherenceReport,
  result: AutopilotResult,
): void {
  const seen = new Set<string>();

  for (const conflict of report.conflicts) {
    if (conflict.severity !== 'blocker') continue;

    // Create a decision per conflict (deduplicated by description hash)
    const key = `${conflict.type}:${conflict.topics.sort().join('+')}:${conflict.subsystems.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const decision: HumanDecision = {
      topic: conflict.topics[0],
      type: mapConflictToDecisionType(conflict),
      description: `${conflict.description}\n  Recommendation: ${conflict.recommendation}`,
      options: [
        { id: 'resolve', label: 'Resolve the conflict (run distill/probe)' },
        { id: 'override', label: 'Override — proceed despite conflict' },
        { id: 'defer', label: 'Defer — leave blocked for now' },
      ],
    };

    result.pendingDecisions.push(decision);
  }

  // Also collect science flags from topics that are blocked
  for (const topicName of report.blocked) {
    const topic = topics.find(t => t.topic === topicName);
    if (!topic) continue;

    for (const sf of topic.scienceFlags.filter(f => !f.resolved)) {
      const key = `sf:${topicName}:${sf.description.slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.pendingDecisions.push({
        topic: topicName,
        type: 'science-flag',
        description: sf.description,
        options: [
          { id: 'accept', label: 'Accept — the analytical change is intended' },
          { id: 'reject', label: 'Reject — revise to avoid the change' },
          { id: 'defer', label: 'Defer — needs more investigation' },
        ],
      });
    }
  }
}

/**
 * Collect decisions from a paused workflow run.
 */
function collectWorkflowDecisions(
  topicName: string,
  run: WorkflowRun,
  result: AutopilotResult,
): void {
  // The workflow paused — it hit a justified gate.
  // We don't have the specific gate info in the run result yet,
  // so create a generic decision.
  result.pendingDecisions.push({
    topic: topicName,
    type: 'science-flag', // Generic — refine when we have gate info
    description: `Workflow ${run.workflowName} paused during execution. A justified gate was hit. Resume with: lattice run ${run.workflowName} --topic ${topicName}`,
    options: [
      { id: 'resume', label: 'Resume after resolving the gate' },
      { id: 'defer', label: 'Defer for later' },
    ],
  });
}

function mapConflictToDecisionType(conflict: Conflict): HumanDecision['type'] {
  switch (conflict.type) {
    case 'science-flag-propagation': return 'science-flag';
    case 'unresolved-cascade': return 'breaks';
    case 'subsystem-overlap': return 'coherence-conflict';
    case 'stale-blueprint': return 'coherence-conflict';
    case 'prerequisite': return 'coherence-conflict';
    default: return 'coherence-conflict';
  }
}
