/**
 * State Reconciliation — derive truth from git, not manually maintained YAML.
 *
 * The problem: cycle state files drift because work happens outside the
 * Lattice skill pipeline (direct sessions, spikes, manual builds). The state
 * says "blueprint-complete" but the code is already shipped.
 *
 * The fix: cross-reference state files against git history to detect and
 * correct stale states. Run automatically before coherence checks.
 *
 * Reconciliation signals:
 * 1. Commits mentioning the topic name (grep commit messages)
 * 2. Synthesis/spec doc archived (moved to archive/ = implemented)
 * 3. Files matching the topic created/modified after state timestamp
 * 4. State says "blueprint-complete" but feat commits exist after that date
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import type { TopicState } from './coherence.js';

export interface ReconciliationResult {
  topic: string;
  stateBefore: string;        // Phase from state file
  stateAfter: string;         // Corrected phase
  evidence: string[];         // What git evidence shows
  action: 'corrected' | 'unchanged' | 'needs-review';
}

/**
 * Reconcile all active topic states against git history.
 * Returns corrections and optionally writes them.
 */
export function reconcileStates(
  topics: TopicState[],
  cwd: string,
  write: boolean = false,
): ReconciliationResult[] {
  const results: ReconciliationResult[] = [];

  for (const topic of topics) {
    const result = reconcileTopic(topic, cwd);
    results.push(result);

    if (write && result.action === 'corrected') {
      updateStateFile(topic.stateFile, result.stateAfter);
    }
  }

  return results;
}

function reconcileTopic(topic: TopicState, cwd: string): ReconciliationResult {
  const evidence: string[] = [];
  let suggestedPhase = topic.phase;

  // 1. Check git log for feat/fix commits mentioning this topic
  const topicKeywords = buildTopicKeywords(topic.topic);
  const recentCommits = findTopicCommits(topicKeywords, cwd, topic.lastCheckpoint);

  if (recentCommits.length > 0) {
    evidence.push(`${recentCommits.length} commit(s) found after last checkpoint:`);
    for (const c of recentCommits.slice(0, 5)) {
      evidence.push(`  ${c}`);
    }
  }

  // 2. Check if synthesis/spec was archived
  const specArchived = checkSpecArchived(topic, cwd);
  if (specArchived) {
    evidence.push(`Spec archived: ${specArchived}`);
  }

  // 3. Check for implementation files matching the topic
  const implFiles = findImplementationFiles(topicKeywords, cwd);
  if (implFiles.length > 0) {
    evidence.push(`Implementation files found: ${implFiles.slice(0, 5).join(', ')}`);
  }

  // 4. Determine corrected phase
  const hasFeatCommits = recentCommits.some(c =>
    /^[a-f0-9]+ feat:/.test(c)
  );
  const hasFixCommits = recentCommits.some(c =>
    /^[a-f0-9]+ fix:/.test(c)
  );

  if (topic.phase === 'blueprint-complete' || topic.phase === 'build') {
    if (hasFeatCommits && implFiles.length > 0) {
      suggestedPhase = 'complete';
      evidence.push('CORRECTION: State says blueprint-complete/build, but feat commits + impl files exist -> complete');
    }
  } else if (topic.phase === 'research-complete') {
    // Check if synthesis exists (would mean blueprint happened)
    const hasSynthesis = checkSynthesisExists(topic, cwd);
    if (hasSynthesis && hasFeatCommits) {
      suggestedPhase = 'complete';
      evidence.push('CORRECTION: State says research-complete, but synthesis + feat commits exist -> complete');
    } else if (hasSynthesis) {
      suggestedPhase = 'blueprint-complete';
      evidence.push('CORRECTION: State says research-complete, but synthesis exists -> blueprint-complete');
    }
  } else if (topic.phase === 'blueprint') {
    if (hasFeatCommits && implFiles.length > 0) {
      suggestedPhase = 'complete';
      evidence.push('CORRECTION: State says blueprint (mid-flight), but feat commits + impl files exist -> complete');
    }
  }

  // If spec was archived, that's strong evidence of completion
  if (specArchived && suggestedPhase !== 'complete') {
    suggestedPhase = 'complete';
    evidence.push('CORRECTION: Spec archived -> definitively complete');
  }

  const action = suggestedPhase !== topic.phase ? 'corrected' : 'unchanged';

  return {
    topic: topic.topic,
    stateBefore: topic.phase,
    stateAfter: suggestedPhase,
    evidence,
    action,
  };
}

/**
 * Build search keywords from a topic name.
 * "hcd-informed-z-scoring" -> ["hcd-informed", "z-scoring", "hcd.*z.scoring", "HCD", "z-score"]
 */
function buildTopicKeywords(topic: string): string[] {
  const parts = topic.split('-');
  const keywords = [topic];

  // Add significant multi-word fragments (skip common words)
  const skipWords = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'pane', 'unified', 'spec', 'fix', 'phases']);
  const significant = parts.filter(p => p.length > 2 && !skipWords.has(p));

  if (significant.length >= 2) {
    // First two significant words as a phrase
    keywords.push(significant.slice(0, 2).join('.*'));
    keywords.push(significant.slice(0, 2).join(' '));
    keywords.push(significant.slice(0, 2).join('-'));
  }

  return keywords;
}

/**
 * Find commits mentioning topic keywords after the last checkpoint.
 */
function findTopicCommits(keywords: string[], cwd: string, after: string): string[] {
  const commits: string[] = [];
  const afterFlag = after ? `--since=${after}` : '--since=2026-01-01';

  for (const kw of keywords.slice(0, 3)) {
    try {
      const output = execSync(
        `git log --oneline ${afterFlag} --grep="${kw}" -i -- frontend/src/ backend/`,
        { cwd, encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      if (output) {
        for (const line of output.split('\n')) {
          if (!commits.includes(line)) commits.push(line);
        }
      }
    } catch {
      // git command failed — skip
    }
  }

  return commits;
}

/**
 * Check if the topic's spec/synthesis has been archived.
 */
function checkSpecArchived(topic: TopicState, cwd: string): string | null {
  const archiveDir = `${cwd}/docs/_internal/incoming/archive`;
  if (!existsSync(archiveDir)) return null;

  const candidates = [
    `${archiveDir}/${topic.topic}.md`,
    `${archiveDir}/${topic.topic}-synthesis.md`,
    `${archiveDir}/${topic.topic}-spec.md`,
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  return null;
}

/**
 * Check if a synthesis doc exists for the topic.
 */
function checkSynthesisExists(topic: TopicState, cwd: string): boolean {
  const candidates = [
    `${cwd}/docs/_internal/incoming/${topic.topic}-synthesis.md`,
    `${cwd}/docs/_internal/incoming/${topic.topic}.md`,
  ];

  return candidates.some(p => existsSync(p));
}

/**
 * Find implementation files that match the topic.
 */
function findImplementationFiles(keywords: string[], cwd: string): string[] {
  const files: string[] = [];

  try {
    // Get all added files in the relevant directories
    const output = execSync(
      'git log --diff-filter=A --name-only --format="" --since=2026-01-01 -- frontend/src/ backend/',
      { cwd, encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (output) {
      const allFiles = output.split('\n').filter(f => f.match(/\.(tsx?|py)$/));
      // Filter by keywords
      for (const file of allFiles) {
        for (const kw of keywords.slice(0, 3)) {
          const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          if (re.test(file) && !files.includes(file)) {
            files.push(file);
          }
        }
      }
    }
  } catch {
    // git command failed
  }

  return files;
}

/**
 * Update a state file's phase to the corrected value.
 */
function updateStateFile(filePath: string, newPhase: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const updated = content.replace(
      /^phase:\s*.+$/m,
      `phase: ${newPhase}`
    );

    // Also update current_step if marking complete
    let final = updated;
    if (newPhase === 'complete') {
      final = final.replace(
        /^current_step:\s*.+$/m,
        `current_step: complete`
      );
    }

    writeFileSync(filePath, final, 'utf-8');
  } catch {
    // File unwritable — skip
  }
}

/**
 * Format reconciliation results for terminal display.
 */
export function formatReconciliation(results: ReconciliationResult[]): string {
  const lines: string[] = [];
  const corrections = results.filter(r => r.action === 'corrected');
  const unchanged = results.filter(r => r.action === 'unchanged');

  lines.push('STATE RECONCILIATION');
  lines.push('='.repeat(70));
  lines.push(`Checked: ${results.length} | Corrected: ${corrections.length} | Unchanged: ${unchanged.length}`);
  lines.push('');

  if (corrections.length > 0) {
    lines.push('CORRECTIONS');
    lines.push('-'.repeat(70));
    for (const r of corrections) {
      lines.push(`  ${r.topic}: ${r.stateBefore} -> ${r.stateAfter}`);
      for (const e of r.evidence) {
        lines.push(`    ${e}`);
      }
      lines.push('');
    }
  }

  if (unchanged.length > 0) {
    lines.push(`UNCHANGED: ${unchanged.map(r => r.topic).join(', ')}`);
  }

  return lines.join('\n');
}
