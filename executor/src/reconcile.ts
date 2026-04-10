/**
 * State Reconciliation — derive truth from git commit trailers.
 *
 * Every commit that advances a topic carries:
 *   Topic: <topic-name>
 *   Phase: <completed-phase>   (optional — inferred from commit type if absent)
 *
 * Reconciliation = grep git log for Topic: trailers, compare against
 * cycle state files, correct any drift.
 *
 * Fallback signals (when trailers are missing — legacy commits):
 *   - Spec archived in docs/_internal/incoming/archive/
 *   - Coverage: trailer mapping to known topics
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { TopicState } from './coherence.js';

export interface ReconciliationResult {
  topic: string;
  stateBefore: string;
  stateAfter: string;
  evidence: string[];
  action: 'corrected' | 'unchanged' | 'needs-review';
}

interface TopicCommit {
  hash: string;
  subject: string;
  topic: string;
  phase?: string;     // Explicit Phase: trailer
  type: string;       // feat, fix, docs, etc.
  coverage?: string;  // Coverage: trailer
}

/**
 * Reconcile all active topic states against git history.
 */
export function reconcileStates(
  topics: TopicState[],
  cwd: string,
  write: boolean = false,
): ReconciliationResult[] {
  // 1. Collect all Topic:-tagged commits from git
  const taggedCommits = collectTopicCommits(cwd);

  // 1b. Supplement with retroactive annotations (.lattice/commit-topics.tsv)
  const retroCommits = loadRetroactiveAnnotations(cwd);
  taggedCommits.push(...retroCommits);

  // 2. Collect archived specs as fallback signal
  const archivedSpecs = collectArchivedSpecs(cwd);

  // 3. Reconcile each active topic
  const results: ReconciliationResult[] = [];

  for (const topic of topics) {
    const result = reconcileTopic(topic, taggedCommits, archivedSpecs);
    results.push(result);

    if (write && result.action === 'corrected') {
      updateStateFile(topic.stateFile, result.stateAfter);
    }
  }

  return results;
}

/**
 * Grep git log for commits with Topic: trailers.
 */
function collectTopicCommits(cwd: string): TopicCommit[] {
  const commits: TopicCommit[] = [];

  try {
    // Format: hash|||subject|||body (body contains trailers)
    const output = execSync(
      'git log --since=2026-01-01 --format=%h|||%s|||%b',
      { cwd, encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (!output) return commits;

    for (const entry of output.split('\n')) {
      const topicMatch = entry.match(/Topic:\s*(\S+)/);
      if (!topicMatch) continue;

      const parts = entry.split('|||');
      const hash = parts[0]?.trim() ?? '';
      const subject = parts[1]?.trim() ?? '';
      const body = parts[2] ?? '';

      const phaseMatch = body.match(/Phase:\s*(\S+)/);
      const coverageMatch = body.match(/Coverage:\s*(.+?)(?:\n|$)/);
      const typeMatch = subject.match(/^(feat|fix|docs|refactor|chore|test):/);

      commits.push({
        hash,
        subject,
        topic: topicMatch[1],
        phase: phaseMatch?.[1],
        type: typeMatch?.[1] ?? 'other',
        coverage: coverageMatch?.[1]?.trim(),
      });
    }
  } catch {
    // git command failed
  }

  return commits;
}

/**
 * Scan archive directory for completed specs.
 */
/**
 * Load retroactive Topic/Phase annotations from .lattice/commit-topics.tsv.
 * This file covers commits made before the Topic: trailer convention existed.
 */
function loadRetroactiveAnnotations(cwd: string): TopicCommit[] {
  const tsvPath = `${cwd}/.lattice/commit-topics.tsv`;
  if (!existsSync(tsvPath)) return [];

  const commits: TopicCommit[] = [];
  try {
    const content = readFileSync(tsvPath, 'utf-8');
    for (const line of content.split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const [hash, topic, phase] = line.split('\t');
      if (!hash || !topic || topic === '-') continue;

      commits.push({
        hash: hash.trim(),
        subject: '(retroactive annotation)',
        topic: topic.trim(),
        phase: phase?.trim() === '-' ? undefined : phase?.trim(),
        type: 'feat', // Assume feat for phase inference
      });
    }
  } catch {
    // File unreadable
  }

  return commits;
}

function collectArchivedSpecs(cwd: string): Set<string> {
  const archived = new Set<string>();
  const archiveDir = `${cwd}/docs/_internal/incoming/archive`;

  if (!existsSync(archiveDir)) return archived;

  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    for (const file of readdirSync(archiveDir)) {
      if (!file.endsWith('.md')) continue;
      // Strip -synthesis.md, -spec.md suffixes to get topic name
      const topic = file
        .replace(/-synthesis\.md$/, '')
        .replace(/-spec\.md$/, '')
        .replace(/\.md$/, '');
      archived.add(topic);
    }
  } catch {
    // directory unreadable
  }

  return archived;
}

function reconcileTopic(
  topic: TopicState,
  taggedCommits: TopicCommit[],
  archivedSpecs: Set<string>,
): ReconciliationResult {
  const evidence: string[] = [];
  let suggestedPhase = topic.phase;

  // 1. Check for Topic:-tagged commits for this topic
  const topicCommits = taggedCommits.filter(c => c.topic === topic.topic);

  if (topicCommits.length > 0) {
    evidence.push(`${topicCommits.length} Topic:-tagged commit(s):`);
    for (const c of topicCommits.slice(0, 5)) {
      evidence.push(`  ${c.hash} ${c.subject}${c.phase ? ` [Phase: ${c.phase}]` : ''}`);
    }

    // Use the most recent explicit Phase: trailer
    const withPhase = topicCommits.filter(c => c.phase);
    if (withPhase.length > 0) {
      const latest = withPhase[0]; // git log is newest-first
      suggestedPhase = latest.phase!;
      evidence.push(`CORRECTION: Explicit Phase: ${latest.phase} in commit ${latest.hash}`);
    } else {
      // Infer phase from commit type
      const hasFeat = topicCommits.some(c => c.type === 'feat');
      if (hasFeat && (topic.phase === 'blueprint-complete' || topic.phase === 'build' || topic.phase === 'blueprint')) {
        suggestedPhase = 'complete';
        evidence.push('CORRECTION: feat commit(s) with Topic: trailer -> complete');
      }
    }
  }

  // 2. Fallback: check if spec was archived
  if (suggestedPhase === topic.phase && archivedSpecs.has(topic.topic)) {
    suggestedPhase = 'complete';
    evidence.push(`CORRECTION: Spec archived -> complete`);
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
 * Update a state file's phase to the corrected value.
 */
function updateStateFile(filePath: string, newPhase: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');

    let updated: string;
    if (/^phase:\s*.+$/m.test(content)) {
      updated = content.replace(/^phase:\s*.+$/m, `phase: ${newPhase}`);
    } else {
      // No phase line — add one after the topic line
      updated = content.replace(/^(topic:\s*.+)$/m, `$1\nphase: ${newPhase}`);
    }

    if (newPhase === 'complete') {
      if (/^current_step:\s*.+$/m.test(updated)) {
        updated = updated.replace(/^current_step:\s*.+$/m, `current_step: complete`);
      }
    }

    writeFileSync(filePath, updated, 'utf-8');
  } catch {
    // File unwritable
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
