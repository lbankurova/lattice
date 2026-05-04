/**
 * Autopilot — continuous portfolio advancement loop.
 *
 * Reads all cycle states, runs coherence check, advances safe topics
 * through their full lifecycle (no phase-transition gates), collects
 * STOP conditions into a human decision batch.
 *
 * Topic lifecycle states:
 *   - active   — eligible for advancement (default)
 *   - paused   — intentionally on hold, skipped by autopilot
 *   - archived — removed from portfolio, not loaded
 *
 * Human intervention ONLY for:
 *   - SCIENCE-FLAG (analytical output changes)
 *   - Persistent FLAWED (genuine scientific disagreement)
 *   - BREAKS (system integrity)
 *   - Architect REJECT (fundamental approach wrong)
 *   - Coherence conflicts (cross-topic subsystem contention)
 *   - Zombie topics (active phase, no lock, stale — needs resume/pause/archive decision)
 *
 * Auto-resolve layer:
 *   - Coherence conflicts that can be resolved by targeted distill analysis
 *   - subsystem-overlap: compatible/read-only interactions
 *   - stale-blueprint: newer research doesn't invalidate
 *   - science-flag-propagation: SF is deferred/contextual
 *   - prerequisite and BREAKS remain human-only
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
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import type { PlatformAdapter, WorkflowRun } from './types.js';
import { loadPortfolioState, checkCoherence, isTopicSafe, formatReport } from './coherence.js';
import type { TopicState, Conflict, CoherenceReport } from './coherence.js';
import { loadWorkflow, resolveWorkflowPath } from './loader.js';
import { executeWorkflow } from './engine.js';
import { reconcileStates, formatReconciliation } from './reconcile.js';
import { tryAutoResolve } from './auto-resolve.js';
import { loadTodoQueue, getTodoAdvanceAction } from './todo-queue.js';
import type { TodoItem } from './todo-queue.js';

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
  /** Source selection: 'topics' = cycle-state YAMLs only,
   *  'todo' = TODO.md `autopilot: ready` items only,
   *  'both' (default) = topics first, then TODO items by score. */
  source?: 'topics' | 'todo' | 'both';
  /** Hard cap on outer-loop iterations (LIT-10). Default 50.
   * Continuous mode normally exits via steady-state (no progress). The cap
   * catches infinite-loop bugs in auto-resolve / phase routing where steady
   * state is never reached and the autopilot would otherwise burn USD until
   * the budget gate fires. */
  maxLoops?: number;
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
  /** TODO.md items advanced through cycle workflows (Bug B / FIX-02). */
  todosAdvanced: string[];
  /** TODO.md items where the cycle workflow failed. */
  todosFailed: string[];
  pendingDecisions: HumanDecision[];
  coherenceReport: CoherenceReport;
  /** Conflicts that were auto-resolved (no human needed) */
  autoResolved: string[];
  /** Stash labels created by the per-item tree cleanup (Phase 1).
   *  Each entry is the message passed to `git stash push -m <label>` so the
   *  user can `git stash list` and recover the abandoned tree if needed. */
  stashedTrees: string[];
  /** True when the candidate loop bailed early because N consecutive items
   *  failed with the same root-cause prefix (Phase 3 circuit breaker). */
  circuitBreakerTripped: boolean;
}

// ── Per-item tree cleanup (Phase 1) ─────────────────────────

/**
 * Maximum number of consecutive same-root-cause failures before the
 * candidate loop bails out (CLAUDE.md rule 7 -- circuit breaker on
 * repeated failures). Reset on any success.
 */
const CIRCUIT_BREAKER_THRESHOLD = 5;

/**
 * Extract a stable root-cause prefix from an error message or workflow
 * failure reason. Used by the circuit breaker to compare consecutive
 * failures. Strategy: take the first non-empty line, strip leading
 * timestamps / paths / ids that change run-to-run, truncate to 120 chars.
 *
 * Heuristic only -- the goal is "two failures with the same SHAPE share a
 * prefix." Two failures with different shapes (one TypeError, one
 * commit-intent mismatch) get different prefixes and don't accumulate.
 */
function rootCausePrefix(message: string | undefined): string {
  if (!message) return '<empty>';
  const firstLine = message.split('\n').find(l => l.trim().length > 0) ?? '';
  return firstLine
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, '<ts>')
    .replace(/[A-Za-z]:[\\/][^\s'"`]+/g, '<path>')
    .replace(/[/][^\s'"`]+\.(ts|js|md|yaml|json|py)/g, '<path>')
    .trim()
    .slice(0, 120);
}

/**
 * Snapshot the current dirty-tree path set via `git status --porcelain -z -uall`.
 *
 * Used by the per-item cleanup to compute the workflow's OWN dirty-tree
 * delta. Paths present in the pre-workflow snapshot are foreign state
 * (parallel session, manual edits, residue from prior items) and must not
 * be stashed -- that's the data-loss bug from 2026-05-04 where ~2300 LOC
 * of a parallel agent's work was swept into a stash labelled with
 * autopilot's failing topic, with no ownership check.
 */
function captureDirtyPaths(cwd: string): Set<string> {
  try {
    const out = execSync('git status --porcelain -z -uall', {
      cwd, encoding: 'utf-8', timeout: 10_000,
    });
    if (!out) return new Set();
    const files = new Set<string>();
    for (const part of out.split('\x00')) {
      // Porcelain -z entries: "XY filename" (XY = 2-char status, then space).
      // Renames split as "XY new\0old", but for ownership tracking we only
      // care about path identity -- treating both halves as dirty is safe
      // (both would be excluded if either was pre-dirty).
      if (part.length > 3) files.add(part.slice(3));
    }
    return files;
  } catch {
    return new Set();
  }
}

/**
 * After a workflow run, stash ONLY paths the workflow itself made dirty,
 * leaving foreign state (anything in `excludePaths`) untouched.
 *
 * `excludePaths` is the dirty-tree snapshot captured BEFORE the workflow
 * ran -- these paths represent state owned by another session or by the
 * user's manual edits. Autopilot must not stash them: that's the
 * data-loss bug from 2026-05-04 (autopilot.ts pre-fix `stashIfDirty` ran
 * `git stash push -u` over the entire dirty tree, capturing a parallel
 * agent's ~2300 LOC and labelling it with autopilot's currently-failing
 * topic name -- the work then became unrecoverable through normal
 * `git stash list` / `git stash apply` flow because successive overlapping
 * stash cycles dropped intermediate refs into dangling git objects).
 *
 * Return values are distinct so the caller can log each case:
 *   - stash label string : workflow-owned changes were stashed
 *   - 'no-changes'        : tree clean before AND after the workflow
 *   - 'foreign-only'      : tree dirty but every dirty path is foreign;
 *                           autopilot leaves it alone
 *   - null                : stash command failed (non-fatal)
 *
 * The caller logs each outcome distinctly so `git stash list` and
 * decisions.log are interpretable.
 */
function stashWorkflowOutput(
  cwd: string,
  excludePaths: Set<string>,
  status: 'completed' | 'paused' | 'failed' | 'error',
  source: string,
  id: string,
): string | 'no-changes' | 'foreign-only' | null {
  const currentDirty = captureDirtyPaths(cwd);
  if (currentDirty.size === 0) return 'no-changes';

  const workflowOwned = [...currentDirty].filter(f => !excludePaths.has(f));
  if (workflowOwned.length === 0) return 'foreign-only';

  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
    const label = `autopilot-${status}-${source}-${safeId}-${ts}`;
    // Path-scoped stash: -u includes untracked files within the listed
    // pathspecs only. CRITICAL difference from the pre-fix unscoped
    // `git stash push -u` -- never sweep paths that were dirty before
    // the workflow ran.
    const quotedPaths = workflowOwned.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
    execSync(`git stash push -u -m "${label}" -- ${quotedPaths}`, {
      cwd, encoding: 'utf-8', timeout: 30_000,
    });
    return label;
  } catch {
    // Non-fatal: leave the workflow's dirty tree behind rather than fall
    // back to unscoped stash (which would re-introduce the data-loss
    // bug). The next item's pre-commit / commit-intent check will catch
    // the leftover dirty state and surface it explicitly.
    return null;
  }
}

// ── Phase-to-workflow mapping ───────────────────────────────

interface AdvanceAction {
  workflow: string;
  description: string;
}

/**
 * Unified candidate type — topics from cycle-state and TODO items from
 * TODO.md route through the same execute loop. `source` discriminates so
 * the loop can apply per-source policy (e.g., topic safety re-eval skips
 * for TODO since cycles do their own coherence).
 */
type AdvanceCandidate =
  | { source: 'topic'; id: string; topic: TopicState; action: AdvanceAction; phaseLabel: string; score: number }
  | { source: 'todo'; id: string; item: TodoItem; action: AdvanceAction; phaseLabel: string; score: number };

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
  const maxLoops = opts.maxLoops ?? 50;
  const stateDir = resolve(cwd, '.lattice/cycle-state');

  const result: AutopilotResult = {
    loopsCompleted: 0,
    topicsAdvanced: [],
    topicsFailed: [],
    todosAdvanced: [],
    todosFailed: [],
    pendingDecisions: [],
    autoResolved: [],
    stashedTrees: [],
    circuitBreakerTripped: false,
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

  const sourceSel: 'topics' | 'todo' | 'both' = opts.source ?? 'both';

  let madeProgress = true;
  let autoResolveAttempted = false; // Prevent infinite auto-resolve loops

  // Loop-scoped cache for portfolio state. loadPortfolioState performs deep
  // doc enrichment (coherence.ts:258-313 reads up to 3 docs per topic at
  // ~100 lines each), so calling it 3-4x per iteration becomes the dominant
  // cost outside the actual skill calls. We cache the enriched state and
  // invalidate only when something actually mutates state files:
  //   - reconcileStates (write mode) corrects stale states
  //   - tryAutoResolve writes resolution to state files
  //   - executeWorkflow runs a skill that mutates state
  // The cache is local to runAutopilot — no global memoization layer.
  let cachedTopics: TopicState[] | null = null;
  let cacheDirty = true;
  const loadTopicsCached = (): TopicState[] => {
    if (cacheDirty || cachedTopics === null) {
      cachedTopics = loadPortfolioState(stateDir, cwd);
      cacheDirty = false;
    }
    return cachedTopics;
  };

  while (madeProgress) {
    if (result.loopsCompleted >= maxLoops) {
      await adapter.sendMessage(`\n[AUTOPILOT] Max-loops cap reached (${maxLoops}). Forcing stop.`);
      await adapter.sendMessage(`This usually means auto-resolve / phase routing oscillates without reaching`);
      await adapter.sendMessage(`steady state. Inspect the most-advanced topics for stuck phases before re-running.`);
      break;
    }
    madeProgress = false;
    result.loopsCompleted++;

    await adapter.sendMessage(`\n${'='.repeat(70)}`);
    await adapter.sendMessage(`AUTOPILOT — Loop ${result.loopsCompleted} of ${maxLoops}`);
    await adapter.sendMessage('='.repeat(70));

    // 1. Load portfolio state with deep doc extraction
    if (!existsSync(stateDir)) {
      await adapter.sendMessage('No cycle state directory. Nothing to do.');
      break;
    }

    // 1a. Reconcile state against git — derive truth before analysis.
    // The raw load here skips deep doc enrichment (no projectRoot arg):
    // reconcile only inspects phase/lifecycleState/currentStep/stateFile,
    // so the enrichment work would be discarded.
    const rawTopics = loadPortfolioState(stateDir);
    const recon = reconcileStates(rawTopics, cwd, true);
    const corrections = recon.filter(r => r.action === 'corrected');
    if (corrections.length > 0) {
      await adapter.sendMessage(`Reconciled ${corrections.length} stale state(s):`);
      for (const c of corrections) {
        await adapter.sendMessage(`  ${c.topic}: ${c.stateBefore} -> ${c.stateAfter}`);
      }
      cacheDirty = true; // reconcile wrote state files
    }

    // 1b. Re-load after corrections (primes the loop-scoped cache).
    cacheDirty = true; // force fresh enriched read at the top of each iteration
    const topics = loadTopicsCached();
    if (topics.length === 0) {
      await adapter.sendMessage('No active topics.');
      break;
    }

    // 2. Run coherence check
    const report = checkCoherence(topics);
    result.coherenceReport = report;

    await adapter.sendMessage(`\nActive: ${report.activeTopics} | Safe: ${report.safe.length} | Blocked: ${report.blocked.length} | Conflicts: ${report.conflicts.filter(c => c.severity === 'blocker').length}`);

    // 3. Identify advanceable candidates from both sources (per --source flag).
    //
    // Topic queue (cycle-state YAMLs): coherence-safe topics with a known
    // phase-to-workflow mapping. Always ranked ahead of TODO items per
    // protocol -- cycle gates (peer review R1+R2, architect, science
    // preservation) are load-bearing and already partially paid.
    //
    // TODO queue (TODO.md `autopilot: ready`): items tagged with any kind
    // (research / spike / bugfix / mechanical). Each kind maps to a real
    // workflow now -- mechanicals run through mechanical-fix-cycle, not
    // skipped. Sorted by score descending. Items whose id collides with
    // an active topic are skipped (the topic-queue path already covers
    // them).
    const advanceable: AdvanceCandidate[] = [];
    const paused: string[] = [];

    if (sourceSel !== 'todo') {
      for (const topicState of topics) {
        // Apply filter if provided
        if (opts.filter && !topicState.topic.includes(opts.filter)) continue;

        // Skip paused topics — they need explicit user decision to resume
        if (topicState.lifecycleState === 'paused') {
          paused.push(topicState.topic);
          continue;
        }

        const safety = isTopicSafe(topicState.topic, report);
        if (!safety.safe) continue;

        const action = getAdvanceAction(topicState);
        if (!action) continue;

        advanceable.push({
          source: 'topic',
          id: topicState.topic,
          topic: topicState,
          action,
          phaseLabel: topicState.phase,
          score: 0,
        });
      }
    }

    if (sourceSel !== 'topics') {
      const activeIds = new Set(topics.map(t => t.topic));
      const todoItems = loadTodoQueue(cwd);
      const todoCandidates: AdvanceCandidate[] = [];
      for (const item of todoItems) {
        if (opts.filter && !item.id.includes(opts.filter)) continue;
        // Skip if already represented in the topic queue (cycle-state file
        // exists). Once a TODO item bootstraps a cycle, its lifecycle is
        // owned by the topic queue going forward.
        if (activeIds.has(item.id)) continue;
        const action = getTodoAdvanceAction(item);
        todoCandidates.push({
          source: 'todo',
          id: item.id,
          item,
          action,
          phaseLabel: `kind:${item.kind}`,
          score: item.score,
        });
      }
      todoCandidates.sort((a, b) => b.score - a.score);
      advanceable.push(...todoCandidates);
      await adapter.sendMessage(
        `TODO queue: ${todoCandidates.length} routable item(s)`
      );
    }

    if (paused.length > 0) {
      await adapter.sendMessage(`Paused (skipping): ${paused.join(', ')}`);
    }

    if (advanceable.length === 0) {
      // Before giving up, try to auto-resolve blocker conflicts
      const blockerConflicts = report.conflicts.filter(c => c.severity === 'blocker');

      if (blockerConflicts.length > 0 && !dryRun && !autoResolveAttempted) {
        autoResolveAttempted = true; // Only try once per autopilot run
        await adapter.sendMessage('\nNo items can be advanced. Attempting auto-resolve...');

        const resolveResults = await tryAutoResolve(blockerConflicts, topics, cwd, adapter);
        const resolved = resolveResults.filter(r => r.verdict === 'RESOLVED');

        if (resolved.length > 0) {
          for (const r of resolved) {
            result.autoResolved.push(`[${r.conflict.type}] ${r.conflict.topics.join(' + ')}: ${r.justification.slice(0, 100)}`);
          }
          await adapter.sendMessage(`\nAuto-resolved ${resolved.length}/${blockerConflicts.length} conflict(s). Re-running coherence...`);
          // State files were updated by applyResolution — re-run coherence
          // and loop again to see if topics are now advanceable
          cacheDirty = true; // applyResolution wrote state files
          madeProgress = true;
          continue;
        }

        await adapter.sendMessage('\nAuto-resolve could not unblock any topics. Collecting human decisions.');
      } else {
        await adapter.sendMessage('\nNo items can be advanced. Autopilot pausing.');
      }

      // Collect pending decisions from blocked topics
      collectPendingDecisions(topics, report, result);
      break;
    }

    // 4. Show what we're about to do
    const previewBatch = advanceable.slice(0, maxAdvancePerLoop);
    await adapter.sendMessage(`\nAdvancing up to ${maxAdvancePerLoop} item(s) from ${advanceable.length} safe candidate(s); refilling slot on failure/pause:`);
    for (const cand of previewBatch) {
      await adapter.sendMessage(`  ${cand.id} [${cand.source}] (${cand.phaseLabel}) -> ${cand.action.workflow}: ${cand.action.description}`);
    }

    if (dryRun) {
      await adapter.sendMessage('\n[DRY RUN] Would advance the above items.');
      for (const cand of previewBatch) {
        if (cand.source === 'topic') result.topicsAdvanced.push(cand.id);
        else result.todosAdvanced.push(cand.id);
      }
      // Still collect decisions for blocked topics
      collectPendingDecisions(topics, report, result);
      break;
    }

    // 5. Execute candidates with count-by-success: advance up to
    //    maxAdvancePerLoop topics *successfully*. When a candidate fails
    //    or pauses, refill the slot from the next safe candidate rather
    //    than burning the budget on attempts. maxAdvancePerLoop caps
    //    forward progress, not attempts — without this, a few failing
    //    topics at the head of the queue cause autopilot to give up
    //    entirely while healthy topics later in the list go untried.
    //
    //    Per-item safety re-evaluation: each completed/paused/failed
    //    item may have changed portfolio state (state files,
    //    decisions.log, research docs). Before any candidate beyond the
    //    first attempt, re-run coherence and skip any topic that became
    //    unsafe mid-batch.
    let advancedThisLoop = 0;
    let attemptsThisLoop = 0;
    let skippedDueToStateChange = 0;

    // Circuit-breaker tracking (Phase 3 / CLAUDE.md rule 7). Track the most
    // recent root-cause prefix and a running count. Reset on any success.
    // When the count reaches CIRCUIT_BREAKER_THRESHOLD, bail out of the
    // candidate loop with a clear message -- the rest of the queue is
    // skipped for this iteration to avoid burning the budget on the same
    // failure shape repeating.
    let lastFailurePrefix: string | null = null;
    let consecutiveFailures = 0;

    for (const cand of advanceable) {
      if (advancedThisLoop >= maxAdvancePerLoop) break;

      // Safety re-eval applies to topic candidates only. TODO items have
      // no upfront coherence record -- each cycle workflow runs its own
      // coherence check at start. Skipping here avoids a false-negative
      // safety result on a fresh TODO id that doesn't appear in `topics`.
      if (attemptsThisLoop > 0 && cand.source === 'topic') {
        // loadTopicsCached returns the cached enriched topics unless a
        // prior workflow / auto-resolve marked the cache dirty.
        const freshTopics = loadTopicsCached();
        const freshReport = checkCoherence(freshTopics);
        const safety = isTopicSafe(cand.id, freshReport);
        if (!safety.safe) {
          skippedDueToStateChange++;
          const reason = safety.conflicts.length > 0
            ? `${safety.conflicts[0].type}: ${safety.conflicts[0].description.slice(0, 80)}`
            : 'new blocker after prior batch item';
          await adapter.sendMessage(`  ${cand.id}: SKIPPED (became unsafe mid-batch -- ${reason})`);
          continue;
        }
      }
      attemptsThisLoop++;

      await adapter.sendMessage(`\n--- Advancing: ${cand.id} [${cand.source}] via ${cand.action.workflow} ---`);

      // Pre-workflow dirty-tree snapshot. Anything dirty NOW belongs to
      // someone else -- a parallel session, the user's manual edits, or
      // residue from a prior item that legitimately couldn't be stashed.
      // The post-workflow stash is path-scoped to (post - pre), so these
      // foreign paths never get swept. Captured per-item rather than
      // once at autopilot start so each item sees the up-to-date set.
      const preWorkflowDirty = captureDirtyPaths(cwd);
      if (preWorkflowDirty.size > 0) {
        await adapter.sendMessage(
          `  ${cand.id}: pre-workflow tree has ${preWorkflowDirty.size} dirty path(s) -- those will be left untouched.`,
        );
      }

      // Per-iteration outcome tracking. We need the status + a failure
      // message AFTER the try/catch so the stash + circuit-breaker logic
      // can run on every exit path (completed / paused / failed / error)
      // exactly once.
      let outcome: 'completed' | 'paused' | 'failed' | 'error' = 'error';
      let failureMessage: string | undefined;

      try {
        const wfPath = resolveWorkflowPath(cand.action.workflow, latticeRoot);
        const wf = loadWorkflow(wfPath);

        const inputs: Record<string, string | number | boolean> = {
          topic: cand.id,
        };

        const run = await executeWorkflow(wf, inputs, {
          cwd,
          adapter,
          latticeRoot,
          skipCoherence: true, // Already checked at autopilot level
        });
        // Any workflow run (completed, paused, failed) may have mutated
        // state files / decisions.log / research docs — invalidate cache
        // so the next mid-batch safety check or post-batch decision
        // collection sees fresh state.
        cacheDirty = true;

        if (run.status === 'completed') {
          if (cand.source === 'topic') result.topicsAdvanced.push(cand.id);
          else result.todosAdvanced.push(cand.id);
          advancedThisLoop++;
          madeProgress = true;
          autoResolveAttempted = false; // Reset — new conflicts may be resolvable
          await adapter.sendMessage(`  ${cand.id}: COMPLETED (${advancedThisLoop}/${maxAdvancePerLoop})`);
          outcome = 'completed';
        } else if (run.status === 'paused') {
          // Hit a human-required gate inside the workflow — surface
          // decisions but don't burn the advance budget; try the next
          // candidate.
          await adapter.sendMessage(`  ${cand.id}: PAUSED (needs human decision; trying next candidate)`);
          collectWorkflowDecisions(cand.id, run, result);
          outcome = 'paused';
        } else {
          // Failure does not consume a slot — refill from next candidate.
          if (cand.source === 'topic') result.topicsFailed.push(cand.id);
          else result.todosFailed.push(cand.id);
          await adapter.sendMessage(`  ${cand.id}: FAILED (${run.status}; trying next candidate)`);
          outcome = 'failed';
          // Best-effort failure message: pull the error from the first
          // failed node in the run (engine.ts records node.error on
          // failure). Falls back to the run status string.
          const failedNode = Object.values(run.nodeResults).find(r => r.status === 'failed');
          failureMessage = failedNode?.error ?? `workflow status: ${run.status}`;
        }
      } catch (err) {
        if (cand.source === 'topic') result.topicsFailed.push(cand.id);
        else result.todosFailed.push(cand.id);
        cacheDirty = true; // a partial workflow run may have written state
        const msg = err instanceof Error ? err.message : String(err);
        await adapter.sendMessage(`  ${cand.id}: ERROR -- ${msg} (trying next candidate)`);
        outcome = 'error';
        failureMessage = msg;
      }

      // Per-item tree cleanup (Phase 1, hardened 2026-05-04 after data-loss
      // incident). Stash ONLY paths the workflow itself made dirty, leaving
      // foreign state untouched. excludePaths is the pre-workflow snapshot
      // captured above; anything in it is owned by another session and is
      // never swept. The stash label encodes outcome + source + id + ISO
      // timestamp so `git stash list` is human-scannable.
      const stashOutcome = stashWorkflowOutput(
        cwd, preWorkflowDirty, outcome, cand.source, cand.id,
      );
      if (typeof stashOutcome === 'string' && stashOutcome !== 'no-changes' && stashOutcome !== 'foreign-only') {
        result.stashedTrees.push(stashOutcome);
        await adapter.sendMessage(`  ${cand.id}: stashed workflow output -- ${stashOutcome}`);
      } else if (stashOutcome === 'foreign-only') {
        await adapter.sendMessage(
          `  ${cand.id}: only foreign dirty paths present -- autopilot is not sweeping them.`,
        );
      } else if (stashOutcome === null) {
        await adapter.sendMessage(
          `  ${cand.id}: stash failed (non-fatal). Workflow's dirty tree left in place; the next item will surface the conflict.`,
        );
      }

      // Circuit-breaker bookkeeping (Phase 3). Reset on success/pause;
      // accumulate on failure/error when the root-cause prefix matches
      // the previous failure. A different prefix resets the counter (a
      // genuinely new failure shape doesn't share blame with the prior
      // one). When the threshold is hit, log + bail.
      if (outcome === 'completed' || outcome === 'paused') {
        lastFailurePrefix = null;
        consecutiveFailures = 0;
      } else {
        const prefix = rootCausePrefix(failureMessage);
        if (prefix === lastFailurePrefix) {
          consecutiveFailures++;
        } else {
          lastFailurePrefix = prefix;
          consecutiveFailures = 1;
        }
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          await adapter.sendMessage(
            `\n[CIRCUIT BREAKER] ${consecutiveFailures} consecutive same-cause failures, bailing for safety.`
          );
          await adapter.sendMessage(`  Root cause prefix: ${prefix}`);
          await adapter.sendMessage(`  See ESCALATION.md / decisions.log for details. Re-run autopilot after addressing the root cause.`);
          result.circuitBreakerTripped = true;
          break;
        }
      }
    }

    if (skippedDueToStateChange > 0) {
      await adapter.sendMessage(`\nSkipped (became unsafe mid-batch): ${skippedDueToStateChange}`);
    }
    if (advancedThisLoop === 0 && attemptsThisLoop > 0) {
      await adapter.sendMessage(`\nAll ${attemptsThisLoop} attempted item(s) failed or paused. Collecting escalations.`);
    }

    // 6. Collect decisions from blocked topics. Re-uses the cached enriched
    // state when no workflow / auto-resolve mutated it during this iteration.
    const finalTopics = loadTopicsCached();
    const finalReport = checkCoherence(finalTopics);
    result.coherenceReport = finalReport;
    collectPendingDecisions(finalTopics, finalReport, result);

    if (singlePass) break;
  }

  // 7. Present human decision batch
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
  await adapter.sendMessage(`Topics advanced: ${result.topicsAdvanced.length} (${result.topicsAdvanced.join(', ') || 'none'})`);
  await adapter.sendMessage(`Topics failed: ${result.topicsFailed.length} (${result.topicsFailed.join(', ') || 'none'})`);
  await adapter.sendMessage(`TODOs advanced: ${result.todosAdvanced.length} (${result.todosAdvanced.join(', ') || 'none'})`);
  await adapter.sendMessage(`TODOs failed: ${result.todosFailed.length} (${result.todosFailed.join(', ') || 'none'})`);
  if (result.stashedTrees.length > 0) {
    await adapter.sendMessage(`Stashed trees: ${result.stashedTrees.length} (recover via 'git stash list')`);
  }
  if (result.circuitBreakerTripped) {
    await adapter.sendMessage(`Circuit breaker: TRIPPED (${CIRCUIT_BREAKER_THRESHOLD} consecutive same-cause failures)`);
  }
  await adapter.sendMessage(`Auto-resolved: ${result.autoResolved.length}`);
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
    case 'zombie-topic': return 'coherence-conflict';
    case 'subsystem-overlap': return 'coherence-conflict';
    case 'stale-blueprint': return 'coherence-conflict';
    case 'prerequisite': return 'coherence-conflict';
    default: return 'coherence-conflict';
  }
}
