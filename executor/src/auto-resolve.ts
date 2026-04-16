/**
 * Auto-resolve — attempt to resolve coherence conflicts without human intervention.
 *
 * When the autopilot hits a blocked topic, it tries to resolve the conflict
 * by running a targeted distill analysis via Claude CLI. The analysis reads
 * the conflicting topics' research/synthesis docs and produces a structured
 * verdict: RESOLVED, NOT_RESOLVED, or NEEDS_HUMAN.
 *
 * Auto-resolvable conflict types:
 *   - subsystem-overlap: topics touch the same subsystem but may be compatible
 *   - stale-blueprint: newer research may not actually invalidate the blueprint
 *   - science-flag-propagation: SF may be misclassified (deferred/contextual)
 *
 * NOT auto-resolvable (always human):
 *   - prerequisite: hard dependency ordering
 *   - unresolved-cascade (BREAKS): system integrity concern
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import type { PlatformAdapter } from './types.js';
import type { Conflict, TopicState } from './coherence.js';

// ── Types ───────────────────────────────────────────────────

export type ResolutionVerdict = 'RESOLVED' | 'NOT_RESOLVED' | 'NEEDS_HUMAN';

export interface AutoResolveResult {
  conflict: Conflict;
  verdict: ResolutionVerdict;
  justification: string;
  stateUpdates: StateUpdate[];
}

export interface StateUpdate {
  /** Topic whose state file should be updated */
  topic: string;
  /** What to change */
  action: 'mark-sf-resolved' | 'mark-sf-deferred' | 'add-cross-topic-interaction' | 'mark-compatible';
  /** Details for the update */
  details: Record<string, string>;
}

const AUTO_RESOLVABLE: Set<Conflict['type']> = new Set([
  'subsystem-overlap',
  'stale-blueprint',
  'science-flag-propagation',
]);

// ── Public API ──────────────────────────────────────────────

/**
 * Attempt to auto-resolve a batch of blocker conflicts.
 * Returns results for each attempt (resolved or not).
 */
export async function tryAutoResolve(
  conflicts: Conflict[],
  topics: TopicState[],
  cwd: string,
  adapter: PlatformAdapter,
): Promise<AutoResolveResult[]> {
  const results: AutoResolveResult[] = [];

  // Filter to auto-resolvable conflicts, deduplicated by topic set + subsystem
  const candidates = conflicts.filter(c =>
    c.severity === 'blocker' && AUTO_RESOLVABLE.has(c.type)
  );

  if (candidates.length === 0) return results;

  await adapter.sendMessage(`\nAUTO-RESOLVE: ${candidates.length} conflict(s) to attempt`);

  for (const conflict of candidates) {
    await adapter.sendMessage(`  Attempting: [${conflict.type}] ${conflict.topics.join(' + ')} on ${conflict.subsystems.join(', ')}`);

    try {
      const result = await resolveConflict(conflict, topics, cwd, adapter);
      results.push(result);

      if (result.verdict === 'RESOLVED') {
        await adapter.sendMessage(`  -> RESOLVED: ${result.justification.slice(0, 150)}`);
        applyResolution(result, cwd);
        await adapter.sendMessage(`  -> Applied ${result.stateUpdates.length} state update(s)`);
      } else {
        await adapter.sendMessage(`  -> ${result.verdict}: ${result.justification.slice(0, 150)}`);
      }
    } catch (err) {
      await adapter.sendMessage(`  -> ERROR: ${err instanceof Error ? err.message : err}`);
      results.push({
        conflict,
        verdict: 'NEEDS_HUMAN',
        justification: `Auto-resolve failed: ${err instanceof Error ? err.message : err}`,
        stateUpdates: [],
      });
    }
  }

  return results;
}

// ── Core resolution logic ───────────────────────────────────

async function resolveConflict(
  conflict: Conflict,
  topics: TopicState[],
  cwd: string,
  adapter: PlatformAdapter,
): Promise<AutoResolveResult> {
  const prompt = buildResolutionPrompt(conflict, topics, cwd);
  const output = executeResolutionAnalysis(prompt, cwd);
  return parseResolutionVerdict(conflict, output);
}

/**
 * Build a targeted prompt for Claude to analyze a specific conflict.
 * The prompt includes conflict details, relevant topic states, and
 * asks for a structured verdict.
 */
function buildResolutionPrompt(
  conflict: Conflict,
  topics: TopicState[],
  cwd: string,
): string {
  const involvedTopics = topics.filter(t => conflict.topics.includes(t.topic));
  const lines: string[] = [];

  lines.push('You are analyzing a coherence conflict between topics in a research portfolio.');
  lines.push('Your job: determine whether this conflict can be resolved without human judgment.');
  lines.push('');
  lines.push('## Conflict');
  lines.push(`Type: ${conflict.type}`);
  lines.push(`Severity: ${conflict.severity}`);
  lines.push(`Subsystems: ${conflict.subsystems.join(', ')}`);
  lines.push(`Topics: ${conflict.topics.join(', ')}`);
  lines.push(`Description: ${conflict.description}`);
  lines.push(`Recommendation: ${conflict.recommendation}`);
  lines.push('');

  // Include topic states
  lines.push('## Topic States');
  for (const topic of involvedTopics) {
    lines.push(`### ${topic.topic} (phase: ${topic.phase})`);
    lines.push(`Subsystems: ${topic.subsystems.join(', ')}`);

    if (topic.scienceFlags.length > 0) {
      lines.push('Science flags:');
      for (const sf of topic.scienceFlags) {
        lines.push(`  - [${sf.scope}${sf.resolved ? ', resolved' : ''}] ${sf.description}`);
        if (sf.subsystems.length > 0) lines.push(`    Affects: ${sf.subsystems.join(', ')}`);
      }
    }

    if (topic.subsystemInteractions.length > 0) {
      lines.push('Subsystem interactions:');
      for (const si of topic.subsystemInteractions) {
        lines.push(`  - ${si.subsystem} [${si.relationship}]: ${si.description}`);
      }
    }

    if (topic.crossTopicInteractions.length > 0) {
      lines.push('Cross-topic interactions:');
      for (const cti of topic.crossTopicInteractions) {
        lines.push(`  - ${cti.topic}: ${cti.overlap} -> ${cti.resolution}`);
      }
    }

    if (topic.keyDecisions.length > 0) {
      lines.push('Key decisions:');
      for (const d of topic.keyDecisions.slice(0, 5)) {
        lines.push(`  - ${d}`);
      }
    }

    lines.push('');
  }

  // Include relevant doc excerpts (first ~100 lines of research/synthesis docs)
  lines.push('## Relevant Documents');
  for (const topic of involvedTopics) {
    for (const docRef of topic.docRefs.slice(0, 3)) {
      const docPath = `${cwd}/${docRef}`;
      if (!existsSync(docPath)) continue;

      try {
        const content = readFileSync(docPath, 'utf-8');
        const excerpt = content.split('\n').slice(0, 100).join('\n');
        lines.push(`### ${docRef}`);
        lines.push(excerpt);
        lines.push('...(truncated)');
        lines.push('');
      } catch {
        // Skip unreadable docs
      }
    }
  }

  // Type-specific analysis instructions
  lines.push('## Analysis Instructions');
  lines.push('');

  switch (conflict.type) {
    case 'subsystem-overlap':
      lines.push('Two or more topics touch the same subsystem. Determine whether:');
      lines.push('1. Both topics only READ the subsystem (COMPATIBLE) -- no conflict');
      lines.push('2. One topic MODIFIES and the other only READS -- safe to sequence');
      lines.push('3. Both MODIFY but in non-overlapping ways -- can coexist');
      lines.push('4. Both MODIFY in conflicting ways -- genuine conflict, needs human');
      lines.push('');
      lines.push('Also check: are the science flags on the overlapping subsystem');
      lines.push('actually about the CURRENT build scope, or are they about a');
      lines.push('deferred proposal? Deferred-proposal SFs should not block.');
      break;

    case 'stale-blueprint':
      lines.push('A blueprint was validated before newer research findings landed.');
      lines.push('Determine whether the newer research:');
      lines.push('1. Does NOT affect the blueprint\'s assumptions -- no conflict');
      lines.push('2. Adds new information the blueprint should incorporate but can do so without redesign');
      lines.push('3. Fundamentally changes assumptions the blueprint relies on -- needs human');
      break;

    case 'science-flag-propagation':
      lines.push('An unresolved SCIENCE-FLAG in one topic might propagate to another.');
      lines.push('Determine whether:');
      lines.push('1. The SF is actually about a DEFERRED proposal (not current scope) -- reclassify, no block');
      lines.push('2. The SF is CONTEXTUAL (mentioned in risk assessment but concluded manageable) -- reclassify');
      lines.push('3. The SF affects a subsystem the downstream topic only READS -- no propagation');
      lines.push('4. The SF genuinely propagates to the downstream build -- needs human');
      break;
  }

  lines.push('');
  lines.push('## Required Output Format');
  lines.push('');
  lines.push('You MUST output your verdict in this exact format (the parser depends on it):');
  lines.push('');
  lines.push('```verdict');
  lines.push('VERDICT: RESOLVED | NOT_RESOLVED | NEEDS_HUMAN');
  lines.push('JUSTIFICATION: <one paragraph explaining why>');
  lines.push('UPDATES:');
  lines.push('- topic:<name> action:<mark-sf-resolved|mark-sf-deferred|add-cross-topic-interaction|mark-compatible> details:<key=value pairs>');
  lines.push('```');
  lines.push('');
  lines.push('If VERDICT is NOT_RESOLVED or NEEDS_HUMAN, UPDATES can be empty.');
  lines.push('If VERDICT is RESOLVED, at least one UPDATE is required.');
  lines.push('');
  lines.push('Be conservative: if you are uncertain, return NEEDS_HUMAN.');
  lines.push('False positives (resolving a genuine conflict) are worse than false negatives.');

  return lines.join('\n');
}

/**
 * Execute the resolution analysis via Claude CLI.
 */
function executeResolutionAnalysis(prompt: string, cwd: string): string {
  const args = [
    '--print',
    '--output-format', 'text',
  ];

  const command = `claude ${args.join(' ')} ${shellQuote(prompt)}`;

  const stdout = execSync(command, {
    cwd,
    encoding: 'utf-8',
    timeout: 300_000, // 5 min for analysis
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  return stdout.trim();
}

/**
 * Parse Claude's output for the structured verdict block.
 */
function parseResolutionVerdict(
  conflict: Conflict,
  output: string,
): AutoResolveResult {
  // Extract the verdict block
  const verdictMatch = output.match(/```verdict\s*\n([\s\S]*?)```/);
  const block = verdictMatch ? verdictMatch[1] : output;

  // Parse VERDICT line
  const verdictLine = block.match(/VERDICT:\s*(RESOLVED|NOT_RESOLVED|NEEDS_HUMAN)/);
  const verdict: ResolutionVerdict = verdictLine
    ? verdictLine[1] as ResolutionVerdict
    : 'NEEDS_HUMAN';

  // Parse JUSTIFICATION line
  const justMatch = block.match(/JUSTIFICATION:\s*(.+?)(?:\n|$)/);
  const justification = justMatch
    ? justMatch[1].trim()
    : 'No justification provided';

  // Parse UPDATES
  const stateUpdates: StateUpdate[] = [];
  const updateLines = block.match(/^-\s+topic:(\S+)\s+action:(\S+)\s+details:(.+)$/gm);

  if (updateLines) {
    for (const line of updateLines) {
      const match = line.match(/^-\s+topic:(\S+)\s+action:(\S+)\s+details:(.+)$/);
      if (!match) continue;

      const [, topic, action, detailsStr] = match;
      const details: Record<string, string> = {};

      // Parse key=value pairs
      const pairs = detailsStr.match(/(\w+)=("[^"]*"|\S+)/g);
      if (pairs) {
        for (const pair of pairs) {
          const [key, ...rest] = pair.split('=');
          details[key] = rest.join('=').replace(/^"|"$/g, '');
        }
      }

      const validActions = ['mark-sf-resolved', 'mark-sf-deferred', 'add-cross-topic-interaction', 'mark-compatible'] as const;
      if (validActions.includes(action as typeof validActions[number])) {
        stateUpdates.push({
          topic,
          action: action as StateUpdate['action'],
          details,
        });
      }
    }
  }

  // Safety: RESOLVED verdict without updates is suspicious -- downgrade
  if (verdict === 'RESOLVED' && stateUpdates.length === 0) {
    return {
      conflict,
      verdict: 'NEEDS_HUMAN',
      justification: `Verdict was RESOLVED but no state updates provided. Downgrading to NEEDS_HUMAN. Original: ${justification}`,
      stateUpdates: [],
    };
  }

  return { conflict, verdict, justification, stateUpdates };
}

// ── State application ───────────────────────────────────────

/**
 * Apply resolution state updates to cycle state files.
 * Only called when verdict is RESOLVED.
 */
function applyResolution(result: AutoResolveResult, cwd: string): void {
  for (const update of result.stateUpdates) {
    const statePath = findStateFile(update.topic, cwd);
    if (!statePath) continue;

    const content = readFileSync(statePath, 'utf-8');
    const data = yaml.load(content) as Record<string, unknown>;
    if (!data) continue;

    switch (update.action) {
      case 'mark-sf-resolved':
        appendAutoResolveEntry(data, 'auto_resolved_sfs', {
          description: update.details['sf'] ?? update.details['description'] ?? 'auto-resolved',
          resolved_by: 'autopilot-auto-resolve',
          timestamp: new Date().toISOString(),
          justification: result.justification,
        });
        break;

      case 'mark-sf-deferred':
        appendAutoResolveEntry(data, 'auto_deferred_sfs', {
          description: update.details['sf'] ?? update.details['description'] ?? 'auto-deferred',
          deferred_by: 'autopilot-auto-resolve',
          timestamp: new Date().toISOString(),
          justification: result.justification,
        });
        break;

      case 'add-cross-topic-interaction':
        if (!data['cross_topic_interactions']) {
          data['cross_topic_interactions'] = [];
        }
        (data['cross_topic_interactions'] as unknown[]).push({
          topic: update.details['other_topic'] ?? '',
          overlap: update.details['overlap'] ?? result.conflict.subsystems.join(', '),
          resolution: update.details['resolution'] ?? result.justification.slice(0, 200),
          added_by: 'autopilot-auto-resolve',
          timestamp: new Date().toISOString(),
        });
        break;

      case 'mark-compatible':
        appendAutoResolveEntry(data, 'auto_compatible', {
          subsystem: update.details['subsystem'] ?? result.conflict.subsystems.join(', '),
          other_topic: update.details['other_topic'] ?? '',
          relationship: 'COMPATIBLE',
          timestamp: new Date().toISOString(),
          justification: result.justification,
        });
        break;
    }

    writeFileSync(statePath, yaml.dump(data, { lineWidth: -1 }), 'utf-8');
  }
}

function appendAutoResolveEntry(
  data: Record<string, unknown>,
  key: string,
  entry: Record<string, string>,
): void {
  if (!data[key]) data[key] = [];
  (data[key] as unknown[]).push(entry);
}

function findStateFile(topicName: string, cwd: string): string | null {
  const path = `${cwd}/.lattice/cycle-state/${topicName}.yaml`;
  return existsSync(path) ? path : null;
}

function shellQuote(s: string): string {
  return `$'${s.replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}
