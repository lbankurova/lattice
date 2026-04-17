/**
 * Coherence Engine — portfolio-level conflict detection.
 *
 * Reads all active cycle states, builds a subsystem-to-topic graph,
 * detects conflicts that make it unsafe to advance a topic.
 *
 * Conflict types:
 * 1. Subsystem overlap — two active topics propose changes to the same subsystem
 * 2. Stale blueprint — blueprint validated before a newer finding that affects its subsystems
 * 3. Unresolved cascade — SF or BREAKS in topic A propagates to subsystems used by topic B
 * 4. Prerequisite violation — topic depends on another that hasn't completed
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

// ── Types ───────────────────────────────────────────────────

export type LifecycleState = 'active' | 'paused' | 'archived';

export interface TopicState {
  topic: string;
  phase: string;
  currentStep: string;
  startedAt: string;
  /** Explicit lifecycle state — active (default), paused (intentional hold), archived */
  lifecycleState: LifecycleState;
  /** Reason for pause (only when lifecycleState === 'paused') */
  pauseReason: string;
  /** Whether this topic currently holds a lock in .lattice/cycle-lock/ */
  hasLock: boolean;
  /** Who holds the lock (e.g., 'build-cycle', 'blueprint-cycle') */
  lockHolder: string | null;
  subsystems: string[];          // S01, S02, etc. — merged from state + docs
  scienceFlags: ScienceFlag[];
  breaks: BreaksEntry[];
  propagates: string[];          // Subsystem IDs that receive cascading changes
  prerequisites: string[];       // Other topics this depends on
  crossTopicInteractions: CrossTopicInteraction[];
  keyDecisions: string[];
  probeResult: string;           // ALL_SAFE, BREAKS, SCIENCE-FLAG, etc.
  lastCheckpoint: string;        // Timestamp of last state update
  stateFile: string;             // Path to the YAML file
  docRefs: string[];             // Paths to research/synthesis docs referenced
  /** Subsystem interaction descriptions from research docs — richer than just S-codes */
  subsystemInteractions: SubsystemInteraction[];
}

export type ScienceFlagScope = 'active' | 'deferred' | 'resolved' | 'contextual';

export interface ScienceFlag {
  description: string;
  subsystems: string[];          // Which subsystems are affected
  resolved: boolean;
  scope: ScienceFlagScope;       // Is this SF about the current build scope?
}

export interface BreaksEntry {
  description: string;
  subsystems: string[];
}

export interface CrossTopicInteraction {
  topic: string;
  overlap: string;
  resolution: string;
}

export interface SubsystemInteraction {
  subsystem: string;             // S01, S07, etc.
  relationship: string;          // COMPATIBLE, MODIFIES, CASCADE, etc.
  description: string;           // Full line from the doc
}

export type ConflictSeverity = 'blocker' | 'warning' | 'info';

export type ConflictType =
  | 'subsystem-overlap'
  | 'stale-blueprint'
  | 'unresolved-cascade'
  | 'prerequisite'
  | 'science-flag-propagation'
  | 'zombie-topic';

export interface Conflict {
  severity: ConflictSeverity;
  type: ConflictType;
  topics: string[];              // Topics involved
  subsystems: string[];          // Subsystems at the intersection
  description: string;
  recommendation: string;        // What the human should decide
}

export interface CoherenceReport {
  timestamp: string;
  activeTopics: number;
  conflicts: Conflict[];
  safe: string[];                // Topics safe to advance
  blocked: string[];             // Topics blocked by conflicts
  needsHuman: string[];          // Topics that need human decision
  subsystemHeatmap: Record<string, string[]>;  // Subsystem -> topics touching it
}

// ── State extraction ────────────────────────────────────────

const SUBSYSTEM_RE = /S(\d{2})/g;
const COMPLETED_PHASES = new Set(['complete', 'build-complete']);
const SKIP_LIFECYCLE = new Set<LifecycleState>(['archived']);

/**
 * Read all cycle state files and extract topic states.
 * @param cycleStateDir Path to .lattice/cycle-state/
 * @param projectRoot Path to the project root (for resolving doc references). Optional — if omitted, skips deep doc extraction.
 */
export function loadPortfolioState(cycleStateDir: string, projectRoot?: string): TopicState[] {
  if (!existsSync(cycleStateDir)) return [];

  const files = readdirSync(cycleStateDir).filter(f => f.endsWith('.yaml'));
  const lockDir = cycleStateDir.replace(/cycle-state\/?$/, 'cycle-lock');
  const topics: TopicState[] = [];

  for (const file of files) {
    const path = `${cycleStateDir}/${file}`;
    try {
      const content = readFileSync(path, 'utf-8');
      const data = yaml.load(content) as Record<string, unknown>;
      if (!data) continue;

      const phase = String(data['phase'] ?? '');
      if (COMPLETED_PHASES.has(phase)) continue; // skip completed topics

      const lifecycleState = parseLifecycleState(data['lifecycle_state']);
      if (SKIP_LIFECYCLE.has(lifecycleState)) continue; // skip archived topics

      const topicName = file.replace('.yaml', '');
      const topic = extractTopicState(topicName, data, content, path);

      // Populate lock info
      const lockMeta = readLockMeta(lockDir, topicName);
      topic.hasLock = lockMeta !== null;
      topic.lockHolder = lockMeta?.holder ?? null;

      // Deep extraction: read referenced docs for richer subsystem data
      if (projectRoot) {
        enrichFromDocs(topic, projectRoot);
      }

      topics.push(topic);
    } catch {
      // Skip unparseable files
    }
  }

  return topics;
}

function parseLifecycleState(raw: unknown): LifecycleState {
  if (raw === 'paused' || raw === 'archived') return raw;
  return 'active';
}

function readLockMeta(lockDir: string, topic: string): { holder: string; acquired: string } | null {
  const metaPath = `${lockDir}/${topic}/meta`;
  if (!existsSync(metaPath)) return null;
  try {
    const content = readFileSync(metaPath, 'utf-8');
    const holder = content.match(/holder:\s*(.+)/)?.[1]?.trim() ?? 'unknown';
    const acquired = content.match(/acquired:\s*(.+)/)?.[1]?.trim() ?? '';
    return { holder, acquired };
  } catch {
    return null;
  }
}

function extractTopicState(
  topicName: string,
  data: Record<string, unknown>,
  rawContent: string,
  filePath: string,
): TopicState {
  const phase = String(data['phase'] ?? '');
  const currentStep = String(data['current_step'] ?? '');

  // Extract subsystem references from the entire file
  const subsystems = extractSubsystems(rawContent);

  // Extract science flags
  const scienceFlags = extractScienceFlags(rawContent);

  // Extract BREAKS
  const breaks = extractBreaks(rawContent);

  // Extract PROPAGATES
  const propagates = extractPropagates(rawContent);

  // Extract prerequisites
  const prerequisites = extractPrerequisites(data);

  // Extract cross-topic interactions
  const crossTopicInteractions = extractCrossTopicInteractions(data);

  // Extract key decisions
  const keyDecisions = extractKeyDecisions(data);

  // Extract probe result
  const probeResult = extractProbeResult(rawContent);

  // Find latest timestamp
  const lastCheckpoint = findLatestTimestamp(rawContent);

  // Extract doc references from state file
  const docRefs = extractDocRefs(rawContent);

  return {
    topic: topicName,
    phase,
    currentStep,
    startedAt: String(data['started'] ?? data['started_at'] ?? ''),
    lifecycleState: parseLifecycleState(data['lifecycle_state']),
    pauseReason: String(data['pause_reason'] ?? ''),
    hasLock: false,       // populated by loadPortfolioState after extraction
    lockHolder: null,     // populated by loadPortfolioState after extraction
    subsystems,
    scienceFlags,
    breaks,
    propagates,
    prerequisites,
    crossTopicInteractions,
    keyDecisions,
    probeResult,
    lastCheckpoint,
    stateFile: filePath,
    docRefs,
    subsystemInteractions: [], // populated by enrichFromDocs
  };
}

/**
 * Extract doc file paths referenced in a state file.
 */
function extractDocRefs(text: string): string[] {
  const paths = new Set<string>();
  const re = /docs\/[^\s"']+\.md/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    paths.add(match[0]);
  }
  return [...paths].sort();
}

// ── Deep doc extraction ─────────────────────────────────────

/**
 * Read the actual research/synthesis docs and enrich the topic state
 * with subsystem references, science flags, and interaction descriptions
 * that only appear in the doc text (not in the state YAML).
 */
function enrichFromDocs(topic: TopicState, projectRoot: string): void {
  // Read primary research doc and synthesis doc (skip peer reviews — too noisy)
  const primaryDocs = topic.docRefs.filter(d =>
    (d.includes('/research/') && !d.includes('peer-reviews/')) ||
    d.includes('/incoming/')
  );

  for (const docRef of primaryDocs) {
    const docPath = `${projectRoot}/${docRef}`;
    if (!existsSync(docPath)) continue;

    try {
      const content = readFileSync(docPath, 'utf-8');

      // 1. Extract subsystem references — merge with state-level extraction
      const docSubsystems = extractSubsystems(content);
      for (const sub of docSubsystems) {
        if (!topic.subsystems.includes(sub)) {
          topic.subsystems.push(sub);
        }
      }
      topic.subsystems.sort();

      // 2. Extract subsystem interaction descriptions
      // Look for compatibility tables, cascade descriptions, architecture sections
      const interactions = extractSubsystemInteractions(content);
      topic.subsystemInteractions.push(...interactions);

      // 3. Extract science flags from doc text that weren't in state file
      const docFlags = extractDocScienceFlags(content);
      for (const flag of docFlags) {
        // Avoid duplicates — check by subsystem + rough description match
        const isDupe = topic.scienceFlags.some(existing =>
          existing.subsystems.some(s => flag.subsystems.includes(s)) &&
          existing.description.length > 0 &&
          flag.description.includes(existing.description.slice(0, 30))
        );
        if (!isDupe) {
          topic.scienceFlags.push(flag);
        }
      }

      // 4. Extract cascade/propagation references
      const docPropagates = extractDocCascades(content);
      for (const sub of docPropagates) {
        if (!topic.propagates.includes(sub)) {
          topic.propagates.push(sub);
        }
      }
      topic.propagates.sort();

    } catch {
      // Doc unreadable — skip silently
    }
  }
}

/**
 * Extract structured subsystem interaction descriptions from a research doc.
 * Catches patterns like:
 *   "| Signal scoring (S10) | COMPATIBLE | ..."
 *   "S40 annotation + D1/D5 modifier fits architecture. Cascade through S16"
 *   "S01 (Findings Pipeline) -- source of per-animal LB values"
 */
function extractSubsystemInteractions(content: string): SubsystemInteraction[] {
  const interactions: SubsystemInteraction[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Table rows with subsystem references and relationship keywords
    const tableMatch = line.match(/\|\s*.*?(S\d{2}).*?\|\s*(COMPATIBLE|MODIFIES|BREAKS|CASCADE|PROPAGATES|SAFE|N\/A)\s*\|\s*(.+?)\s*\|/i);
    if (tableMatch) {
      interactions.push({
        subsystem: tableMatch[1],
        relationship: tableMatch[2].toUpperCase(),
        description: tableMatch[3].trim(),
      });
      continue;
    }

    // "Cascade through SXX" patterns
    const cascadeMatch = line.match(/[Cc]ascade\s+through\s+(S\d{2})\s*(?:\(([^)]+)\))?/);
    if (cascadeMatch) {
      interactions.push({
        subsystem: cascadeMatch[1],
        relationship: 'CASCADE',
        description: cascadeMatch[2] ?? line.trim().slice(0, 150),
      });
    }

    // "SXX (Name) -- description" header patterns
    const headerMatch = line.match(/^(S\d{2})\s*\(([^)]+)\)\s*[-:]+\s*(.+)/);
    if (headerMatch) {
      interactions.push({
        subsystem: headerMatch[1],
        relationship: 'REFERENCE',
        description: `${headerMatch[2]}: ${headerMatch[3].trim()}`,
      });
    }
  }

  return interactions;
}

/**
 * Extract science flag descriptions from doc text.
 *
 * Key improvement: classifies each SF as active/deferred/resolved/contextual.
 * Only 'active' SFs block coherence. Deferred-proposal SFs (e.g., HCD-z P2
 * variance borrowing) and resolved SFs are ignored by conflict detection.
 *
 * Also filters out false positives:
 * - Subsystem reference headers ("S07 (Confidence) -- RCV concordance")
 * - Table rows describing proposals with "No" in scope column
 * - Lines that mention SF but conclude "Not SCIENCE-FLAG"
 */
function extractDocScienceFlags(content: string): ScienceFlag[] {
  const flags: ScienceFlag[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    // Skip lines that are just counts ("0 SCIENCE-FLAGS")
    if (/0\s+SCIENCE/i.test(line)) continue;

    // Explicit SCIENCE-FLAG markers
    if (upper.includes('SCIENCE-FLAG') || upper.includes('SCIENCE FLAG')) {
      // Skip subsystem reference headers — these describe architecture, not flag a problem
      // Pattern: "+-- S07 (Name) -- description" or "S07 (Name) — description"
      if (/^\s*\+?--\s*S\d{2}\s*\(/.test(line)) continue;

      // Skip "Not SCIENCE-FLAG" / "no SCIENCE-FLAG" conclusions
      if (/NOT\s+SCIENCE.FLAG|no\s+SCIENCE.FLAG|Not\s+SF/i.test(line)) continue;

      const subsystems = extractSubsystems(line);
      if (subsystems.length === 0) {
        for (let j = 1; j <= 2 && i + j < lines.length; j++) {
          subsystems.push(...extractSubsystems(lines[i + j]));
        }
      }

      // Get surrounding context for scope classification
      const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join('\n');
      const scope = classifyDocSFScope(line, context);

      flags.push({
        description: line.trim().replace(/^[#*\-\s|]+/, '').slice(0, 200),
        subsystems: [...new Set(subsystems)],
        resolved: scope === 'resolved',
        scope,
      });
    }
  }

  // NOTE: Removed the "confidence modifier/dimension" pattern matcher.
  // It produced false positives on subsystem reference headers like
  // "+-- S07 (Confidence) -- RCV concordance as confidence dimension".
  // Real confidence-related SFs are caught by the explicit SCIENCE-FLAG marker above.

  return flags;
}

/**
 * Classify a doc-extracted SF's scope from surrounding context.
 */
function classifyDocSFScope(line: string, context: string): ScienceFlagScope {
  // Resolved
  if (/RESOLVED|ALREADY GATED|ACCEPTED/i.test(line)) return 'resolved';
  if (/SCIENCE.FLAG\s+RESOLUTION|RESOLVES.*SCIENCE.FLAG/i.test(line)) return 'resolved';

  // Deferred — the SF is about a proposal not in the current build
  if (/DEFERRED|SEPARATE CYCLE|NOT IN THIS|FUTURE|NOT IN SCOPE/i.test(line)) return 'deferred';
  if (/\|\s*No\s*[-—]/i.test(line)) return 'deferred'; // Table row: "| No — separate cycle |"

  // Check context for deferred signals
  if (/deferred to separate|not in this cycle|separate research/i.test(context)) {
    // But only if the context is about the SAME proposal as the SF line
    if (/this cycle|current cycle|P1/i.test(context) === false) {
      return 'deferred';
    }
  }

  // Contextual — mentioned in risk assessment that concludes it's manageable
  if (/Risk:.*Not SCIENCE|changes confidence labels.*Not SCIENCE/i.test(context)) return 'contextual';

  // If the line is inside a table comparing proposals and the row says "High" risk
  // but the "This Cycle?" column says "No", it's deferred
  if (/\|\s*High\s*[-—]\s*SCIENCE/i.test(line) && /\|\s*No\s/i.test(line)) return 'deferred';

  return 'active';
}

/**
 * Extract cascade/propagation references from doc text.
 * Catches "cascade through SXX", "propagates to SXX", etc.
 */
function extractDocCascades(content: string): string[] {
  const subsystems = new Set<string>();
  const lines = content.split('\n');

  for (const line of lines) {
    if (/cascade|propagat/i.test(line)) {
      for (const sub of extractSubsystems(line)) {
        subsystems.add(sub);
      }
    }
  }

  return [...subsystems].sort();
}

function extractSubsystems(text: string): string[] {
  const matches = new Set<string>();
  let match;
  const re = new RegExp(SUBSYSTEM_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    matches.add('S' + match[1]);
  }
  return [...matches].sort();
}

function extractScienceFlags(text: string): ScienceFlag[] {
  const flags: ScienceFlag[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes('SCIENCE-FLAG') || upper.includes('SCIENCE_FLAG')) {
      // Skip lines that are just counts ("0 SCIENCE-FLAGS", "science_flags: 0")
      if (/0\s+SCIENCE|science_flags:\s*0/i.test(line)) continue;

      const subsystems = extractSubsystems(line);
      const scope = classifySFScope(line, text);

      flags.push({
        description: line.trim().replace(/^[-"'\s]+/, '').replace(/["']+$/, ''),
        subsystems,
        resolved: scope === 'resolved',
        scope,
      });
    }
  }

  return flags;
}

/**
 * Classify a science flag's scope from its textual context.
 */
function classifySFScope(line: string, fullText: string): ScienceFlagScope {
  const upper = line.toUpperCase();

  // Resolved indicators
  if (/RESOLVED|ALREADY GATED|ACCEPTED|NO SCIENCE.FLAG/i.test(line)) {
    return 'resolved';
  }

  // Deferred indicators — the SF is about a proposal not in the current cycle
  if (/DEFERRED|SEPARATE CYCLE|NOT IN THIS|PHASE [2-9]|FUTURE|NOT IN SCOPE|NO\s*[-—]\s*SEPARATE/i.test(line)) {
    return 'deferred';
  }

  // Contextual indicators — mentioned in discussion, comparison tables, risk assessments
  // that conclude it's NOT a science flag
  if (/NOT\s+SCIENCE.FLAG|NOT\s+SF|RISK:.*NOT/i.test(line)) {
    return 'contextual';
  }

  // "Resolves:" pattern — this line is about resolving a prior SF, not raising a new one
  if (/\bRESOLVES\b.*SCIENCE.FLAG|SCIENCE.FLAG\s+RESOLUTION/i.test(line)) {
    return 'resolved';
  }

  // Check surrounding context for deferred indicators
  const lineIdx = fullText.indexOf(line);
  if (lineIdx >= 0) {
    const context = fullText.slice(Math.max(0, lineIdx - 300), lineIdx + line.length + 300);
    if (/deferred to separate|not in this cycle|separate research.to.build/i.test(context)) {
      return 'deferred';
    }
    // Table row with "No" in the "This Cycle?" column
    if (/\|\s*No\s*[-—]\s*separate/i.test(context)) {
      return 'deferred';
    }
  }

  return 'active';
}

function extractBreaks(text: string): BreaksEntry[] {
  const entries: BreaksEntry[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Match lines that mention BREAKS with actual content (not just "0 BREAKS")
    if (/BREAKS/i.test(line) && !/0\s+BREAKS/i.test(line) && !/breaks:\s*0/i.test(line)) {
      const subsystems = extractSubsystems(line);
      entries.push({
        description: line.trim().replace(/^[-"'\s]+/, '').replace(/["']+$/, ''),
        subsystems,
      });
    }
  }

  return entries;
}

function extractPropagates(text: string): string[] {
  const subsystems = new Set<string>();
  const lines = text.split('\n');

  for (const line of lines) {
    if (/PROPAGATE/i.test(line)) {
      for (const s of extractSubsystems(line)) {
        subsystems.add(s);
      }
    }
  }

  return [...subsystems].sort();
}

function extractPrerequisites(data: Record<string, unknown>): string[] {
  const prereqs: string[] = [];

  // Direct prerequisite field
  const prereq = data['prerequisite'] as string | undefined;
  if (prereq) {
    // Extract topic names from prerequisite text
    const match = prereq.match(/(\S+-\S+)\s+must\s+be/);
    if (match) prereqs.push(match[1]);
  }

  // Implementation context prerequisites
  const ctx = data['implementation_context'] as Record<string, unknown> | undefined;
  if (ctx?.['prerequisite']) {
    const match = String(ctx['prerequisite']).match(/(\S+-\S+)\s+must\s+be/);
    if (match) prereqs.push(match[1]);
  }

  return prereqs;
}

function extractCrossTopicInteractions(data: Record<string, unknown>): CrossTopicInteraction[] {
  const interactions: CrossTopicInteraction[] = [];

  // Walk the object tree looking for cross_topic_interactions arrays
  const text = yaml.dump(data, { lineWidth: -1 });
  const lines = text.split('\n');

  let inCrossTopic = false;
  let currentInteraction: Partial<CrossTopicInteraction> = {};

  for (const line of lines) {
    if (/cross_topic_interactions:/.test(line)) {
      inCrossTopic = true;
      continue;
    }
    if (inCrossTopic) {
      const topicMatch = line.match(/topic:\s*(.+)/);
      const overlapMatch = line.match(/overlap:\s*"?(.+?)"?\s*$/);
      const resolutionMatch = line.match(/resolution:\s*"?(.+?)"?\s*$/);

      if (topicMatch) currentInteraction.topic = topicMatch[1].trim().replace(/"/g, '');
      if (overlapMatch) currentInteraction.overlap = overlapMatch[1].trim();
      if (resolutionMatch) {
        currentInteraction.resolution = resolutionMatch[1].trim();
        if (currentInteraction.topic && currentInteraction.overlap) {
          interactions.push(currentInteraction as CrossTopicInteraction);
        }
        currentInteraction = {};
      }

      // End of section (non-indented line)
      if (line.match(/^[a-z]/)) {
        inCrossTopic = false;
      }
    }
  }

  return interactions;
}

function extractKeyDecisions(data: Record<string, unknown>): string[] {
  const decisions: string[] = [];
  const text = yaml.dump(data, { lineWidth: -1 });

  // Find key_decisions arrays
  const re = /key_decisions:\s*\n((?:\s+-\s*.+\n)+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const items = match[1].split('\n')
      .filter(l => l.trim().startsWith('-'))
      .map(l => l.trim().replace(/^-\s*"?/, '').replace(/"?\s*$/, ''));
    decisions.push(...items);
  }

  return decisions;
}

function extractProbeResult(text: string): string {
  // Find the probe verdict line
  const lines = text.split('\n');
  for (const line of lines) {
    if (/probe.*result|result.*probe/i.test(line)) {
      if (/ALL.SAFE/i.test(line)) return 'ALL_SAFE';
      if (/BREAKS/i.test(line) && !/0\s+BREAKS/i.test(line)) return 'BREAKS';
      if (/SCIENCE.FLAG/i.test(line) && !/0\s+SCIENCE/i.test(line)) return 'SCIENCE-FLAG';
    }
    // Also check probe: field in checkpoints
    if (/probe:\s*"/.test(line)) {
      if (/BREAKS/i.test(line) && !/0 BREAKS/i.test(line)) return 'BREAKS';
      if (/SCIENCE.FLAG/i.test(line) && !/0 SCIENCE/i.test(line)) return 'SCIENCE-FLAG';
    }
  }
  return 'unknown';
}

function findLatestTimestamp(text: string): string {
  const timestamps = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g) ?? [];
  if (timestamps.length === 0) return '';
  return timestamps.sort().pop()!;
}

// ── Conflict detection ──────────────────────────────────────

/**
 * Run the full coherence check across all active topics.
 */
export function checkCoherence(topics: TopicState[]): CoherenceReport {
  const conflicts: Conflict[] = [];

  // Build subsystem heatmap
  const heatmap = buildSubsystemHeatmap(topics);

  // 1. Subsystem overlap — multiple active topics touching the same subsystem
  conflicts.push(...detectSubsystemOverlap(topics, heatmap));

  // 2. Unresolved science flag propagation
  conflicts.push(...detectScienceFlagPropagation(topics, heatmap));

  // 3. Stale blueprints
  conflicts.push(...detectStaleBlueprints(topics));

  // 4. Prerequisite violations
  conflicts.push(...detectPrerequisiteViolations(topics));

  // 5. Unresolved BREAKS cascading to other topics
  conflicts.push(...detectBreaksCascade(topics, heatmap));

  // 6. Zombie topics — active phase, no lock, no recent checkpoint
  conflicts.push(...detectZombieTopics(topics));

  // Classify topics
  const blockedSet = new Set<string>();
  const needsHumanSet = new Set<string>();

  for (const c of conflicts) {
    for (const t of c.topics) {
      if (c.severity === 'blocker') {
        blockedSet.add(t);
      } else if (c.severity === 'warning') {
        needsHumanSet.add(t);
      }
    }
  }

  const advanceable = new Set(['research-complete', 'blueprint-complete', 'blueprint', 'research', 'build', 'spike']);
  const safe = topics
    .filter(t =>
      advanceable.has(t.phase) &&
      t.lifecycleState === 'active' &&
      !blockedSet.has(t.topic) &&
      !needsHumanSet.has(t.topic)
    )
    .map(t => t.topic);

  return {
    timestamp: new Date().toISOString(),
    activeTopics: topics.length,
    conflicts,
    safe,
    blocked: [...blockedSet],
    needsHuman: [...needsHumanSet].filter(t => !blockedSet.has(t)),
    subsystemHeatmap: heatmap,
  };
}

function buildSubsystemHeatmap(topics: TopicState[]): Record<string, string[]> {
  const heatmap: Record<string, string[]> = {};

  for (const topic of topics) {
    for (const sub of topic.subsystems) {
      if (!heatmap[sub]) heatmap[sub] = [];
      heatmap[sub].push(topic.topic);
    }
    // Also count propagates as touching
    for (const sub of topic.propagates) {
      if (!heatmap[sub]) heatmap[sub] = [];
      if (!heatmap[sub].includes(topic.topic)) {
        heatmap[sub].push(topic.topic);
      }
    }
  }

  return heatmap;
}

/**
 * Detect when multiple active topics MODIFY the same subsystem
 * and at least one has active science flags or BREAKS.
 *
 * Key distinction: topics that only READ a subsystem (COMPATIBLE, REFERENCE
 * relationships) don't conflict with each other. Only MODIFIES/CASCADE
 * relationships indicate a write that could conflict.
 */
function detectSubsystemOverlap(
  topics: TopicState[],
  heatmap: Record<string, string[]>,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const seen = new Set<string>();

  for (const [sub, topicNames] of Object.entries(heatmap)) {
    if (topicNames.length < 2) continue;

    // Filter to topics that MODIFY this subsystem (not just read/reference it)
    const modifiers = topicNames.filter(name => {
      const t = topics.find(ts => ts.topic === name);
      if (!t) return false;
      // If topic has subsystem interactions, check for MODIFIES/CASCADE
      if (t.subsystemInteractions.length > 0) {
        const interaction = t.subsystemInteractions.find(i => i.subsystem === sub);
        if (interaction) {
          // COMPATIBLE and REFERENCE are read-only — not a modifier
          return !['COMPATIBLE', 'REFERENCE', 'SAFE'].includes(interaction.relationship);
        }
      }
      // No interaction data — conservatively assume modifier if topic has active SFs
      return t.scienceFlags.some(sf => sf.scope === 'active') || t.breaks.length > 0;
    });

    // Only flag conflict if at least one topic has active SFs or BREAKS
    // that SPECIFICALLY target this subsystem (not just any SF on the topic)
    const topicsWithIssues = topics.filter(t =>
      modifiers.includes(t.topic) && (
        t.scienceFlags.some(sf => sf.scope === 'active' && sf.subsystems.includes(sub)) ||
        t.breaks.some(b => b.subsystems.includes(sub))
      )
    );

    if (topicsWithIssues.length > 0) {
      const key = topicNames.sort().join('+') + ':' + sub;
      if (seen.has(key)) continue;
      seen.add(key);

      const issueTopics = topicsWithIssues.map(t => t.topic);
      const otherTopics = topicNames.filter(t => !issueTopics.includes(t));

      conflicts.push({
        severity: 'blocker',
        type: 'subsystem-overlap',
        topics: topicNames,
        subsystems: [sub],
        description: `${sub} is touched by ${topicNames.length} active topics (${topicNames.join(', ')}). ` +
          `${issueTopics.join(', ')} have unresolved science flags or BREAKS on this subsystem.`,
        recommendation: `Run distill across these topics to resolve the ${sub} conflict before advancing any of them.`,
      });
    } else if (topicNames.length >= 3) {
      // High contention even without SFs — worth a warning
      const key = topicNames.sort().join('+') + ':' + sub;
      if (seen.has(key)) continue;
      seen.add(key);

      conflicts.push({
        severity: 'info',
        type: 'subsystem-overlap',
        topics: topicNames,
        subsystems: [sub],
        description: `${sub} is touched by ${topicNames.length} active topics: ${topicNames.join(', ')}.`,
        recommendation: `No active conflicts, but high contention. Consider sequencing builds to avoid merge conflicts.`,
      });
    }
  }

  return conflicts;
}

/**
 * Detect when a topic has an unresolved SCIENCE-FLAG that propagates to
 * a subsystem used by another topic's blueprint.
 */
function detectScienceFlagPropagation(
  topics: TopicState[],
  heatmap: Record<string, string[]>,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const buildablePhases = new Set(['blueprint-complete', 'build']);

  for (const source of topics) {
    const unresolvedSFs = source.scienceFlags.filter(sf => sf.scope === 'active');
    if (unresolvedSFs.length === 0) continue;

    // For each unresolved SF, check which subsystems it affects
    for (const sf of unresolvedSFs) {
      const affectedSubs = sf.subsystems.length > 0
        ? sf.subsystems
        : source.subsystems; // If no specific subsystems, assume all of source's subsystems

      for (const sub of affectedSubs) {
        const consumers = (heatmap[sub] ?? []).filter(t => t !== source.topic);
        const buildableConsumers = consumers.filter(t => {
          const topicState = topics.find(ts => ts.topic === t);
          return topicState && buildablePhases.has(topicState.phase);
        });

        if (buildableConsumers.length > 0) {
          conflicts.push({
            severity: 'blocker',
            type: 'science-flag-propagation',
            topics: [source.topic, ...buildableConsumers],
            subsystems: [sub],
            description: `${source.topic} has unresolved SCIENCE-FLAG affecting ${sub}: "${sf.description.slice(0, 120)}". ` +
              `${buildableConsumers.join(', ')} are ready to build and depend on ${sub}.`,
            recommendation: `Resolve the SF in ${source.topic} before building ${buildableConsumers.join(', ')}. ` +
              `The build may need to account for the analytical change.`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Detect blueprints validated before a newer finding landed in a related topic.
 */
function detectStaleBlueprints(topics: TopicState[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const blueprintPhases = new Set(['blueprint-complete']);

  const blueprintTopics = topics.filter(t => blueprintPhases.has(t.phase));
  const researchTopics = topics.filter(t =>
    t.phase === 'research' || t.phase === 'research-complete'
  );

  for (const blueprint of blueprintTopics) {
    for (const research of researchTopics) {
      // Check if they share subsystems
      const shared = blueprint.subsystems.filter(s => research.subsystems.includes(s));
      if (shared.length === 0) continue;

      // Check if research has newer findings (by timestamp)
      if (research.lastCheckpoint > blueprint.lastCheckpoint) {
        // Check for cross-topic interactions mentioning each other
        const interaction = blueprint.crossTopicInteractions.find(
          i => i.topic === research.topic
        );

        if (interaction) {
          // Known interaction — check if resolution is still valid
          conflicts.push({
            severity: 'warning',
            type: 'stale-blueprint',
            topics: [blueprint.topic, research.topic],
            subsystems: shared,
            description: `${blueprint.topic}'s blueprint was validated before ${research.topic}'s latest research checkpoint. ` +
              `They share subsystems [${shared.join(', ')}]. Known interaction: "${interaction.overlap}".`,
            recommendation: `Verify that ${research.topic}'s latest findings don't invalidate ${blueprint.topic}'s blueprint. ` +
              `Run targeted distill on the shared subsystems.`,
          });
        } else if (shared.length >= 2) {
          // Unknown interaction with significant subsystem overlap
          conflicts.push({
            severity: 'warning',
            type: 'stale-blueprint',
            topics: [blueprint.topic, research.topic],
            subsystems: shared,
            description: `${blueprint.topic}'s blueprint (${blueprint.lastCheckpoint.slice(0, 10)}) predates ` +
              `${research.topic}'s latest findings (${research.lastCheckpoint.slice(0, 10)}). ` +
              `${shared.length} shared subsystems [${shared.join(', ')}] with no documented cross-topic interaction.`,
            recommendation: `Run distill across both topics to check for undocumented conflicts on [${shared.join(', ')}].`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Detect topics that depend on others that haven't completed.
 */
function detectPrerequisiteViolations(topics: TopicState[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const allTopicNames = new Set(topics.map(t => t.topic));

  for (const topic of topics) {
    for (const prereq of topic.prerequisites) {
      // Check if prerequisite is still active (not completed)
      if (allTopicNames.has(prereq)) {
        const prereqTopic = topics.find(t => t.topic === prereq)!;
        if (!COMPLETED_PHASES.has(prereqTopic.phase)) {
          conflicts.push({
            severity: 'blocker',
            type: 'prerequisite',
            topics: [topic.topic, prereq],
            subsystems: [],
            description: `${topic.topic} requires ${prereq} to complete first, ` +
              `but ${prereq} is still in phase "${prereqTopic.phase}".`,
            recommendation: `Advance ${prereq} to completion before building ${topic.topic}.`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Detect unresolved BREAKS that cascade to other topics' subsystems.
 */
function detectBreaksCascade(
  topics: TopicState[],
  heatmap: Record<string, string[]>,
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const source of topics) {
    if (source.breaks.length === 0) continue;

    for (const brk of source.breaks) {
      const affectedSubs = brk.subsystems.length > 0
        ? brk.subsystems
        : source.subsystems;

      for (const sub of affectedSubs) {
        const consumers = (heatmap[sub] ?? []).filter(t => t !== source.topic);
        if (consumers.length > 0) {
          conflicts.push({
            severity: 'blocker',
            type: 'unresolved-cascade',
            topics: [source.topic, ...consumers],
            subsystems: [sub],
            description: `${source.topic} has unresolved BREAKS on ${sub}: "${brk.description.slice(0, 120)}". ` +
              `This cascades to: ${consumers.join(', ')}.`,
            recommendation: `Resolve the BREAKS in ${source.topic} before advancing dependent topics.`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Detect zombie topics — active phase but no lock and no recent checkpoint.
 * These are topics that appear to be in progress but aren't actually being worked on.
 * Severity is warning (not blocker) because the user may have a valid reason.
 */
const ZOMBIE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours
const ZOMBIE_PHASES = new Set(['research', 'blueprint', 'build', 'spike', 'bugfix']);

function detectZombieTopics(topics: TopicState[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const now = Date.now();

  for (const topic of topics) {
    if (topic.lifecycleState !== 'active') continue;
    if (!ZOMBIE_PHASES.has(topic.phase)) continue;
    if (topic.hasLock) continue; // actively locked -- not a zombie

    // Check last checkpoint age
    if (!topic.lastCheckpoint) continue; // no timestamp to judge
    const lastTime = new Date(topic.lastCheckpoint).getTime();
    if (isNaN(lastTime)) continue;

    const ageMs = now - lastTime;
    if (ageMs > ZOMBIE_THRESHOLD_MS) {
      const ageHours = Math.round(ageMs / (60 * 60 * 1000));
      conflicts.push({
        severity: 'warning',
        type: 'zombie-topic',
        topics: [topic.topic],
        subsystems: topic.subsystems,
        description: `${topic.topic} is in phase "${topic.phase}" but has no lock and last checkpoint was ${ageHours}h ago.`,
        recommendation: `Resume with \`lattice run ${topic.phase}-cycle --topic ${topic.topic}\`, pause with lifecycle_state: paused, or archive.`,
      });
    }
  }

  return conflicts;
}

// ── Report formatting ───────────────────────────────────────

/**
 * Format a coherence report for terminal display.
 */
export function formatReport(report: CoherenceReport): string {
  const lines: string[] = [];

  lines.push('COHERENCE REPORT');
  lines.push('='.repeat(70));
  lines.push(`Active topics: ${report.activeTopics}`);
  lines.push(`Conflicts: ${report.conflicts.length} (${report.conflicts.filter(c => c.severity === 'blocker').length} blockers, ${report.conflicts.filter(c => c.severity === 'warning').length} warnings)`);
  lines.push(`Safe to advance: ${report.safe.length}`);
  lines.push(`Blocked: ${report.blocked.length}`);
  lines.push(`Needs human: ${report.needsHuman.length}`);
  lines.push('');

  // Blockers
  const blockers = report.conflicts.filter(c => c.severity === 'blocker');
  if (blockers.length > 0) {
    lines.push('BLOCKERS');
    lines.push('-'.repeat(70));
    for (const c of blockers) {
      lines.push(`  [${c.type}] ${c.description}`);
      lines.push(`  -> ${c.recommendation}`);
      lines.push('');
    }
  }

  // Warnings
  const warnings = report.conflicts.filter(c => c.severity === 'warning');
  if (warnings.length > 0) {
    lines.push('WARNINGS');
    lines.push('-'.repeat(70));
    for (const c of warnings) {
      lines.push(`  [${c.type}] ${c.description}`);
      lines.push(`  -> ${c.recommendation}`);
      lines.push('');
    }
  }

  // Zombies
  const zombies = report.conflicts.filter(c => c.type === 'zombie-topic');
  if (zombies.length > 0) {
    lines.push('ZOMBIE TOPICS (active phase, no lock, stale checkpoint)');
    lines.push('-'.repeat(70));
    for (const c of zombies) {
      lines.push(`  ${c.description}`);
      lines.push(`  -> ${c.recommendation}`);
      lines.push('');
    }
  }

  // Safe
  if (report.safe.length > 0) {
    lines.push('SAFE TO ADVANCE');
    lines.push('-'.repeat(70));
    for (const t of report.safe) {
      lines.push(`  ${t}`);
    }
    lines.push('');
  }

  // Subsystem heatmap (only show contended subsystems)
  const contended = Object.entries(report.subsystemHeatmap)
    .filter(([_, topics]) => topics.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length);

  if (contended.length > 0) {
    lines.push('SUBSYSTEM HEATMAP (contended)');
    lines.push('-'.repeat(70));
    for (const [sub, topics] of contended) {
      lines.push(`  ${sub}: ${topics.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if a specific topic is safe to advance given the current portfolio state.
 * Used by the executor as a pre-advancement gate.
 */
export function isTopicSafe(topic: string, report: CoherenceReport): {
  safe: boolean;
  conflicts: Conflict[];
} {
  const topicConflicts = report.conflicts.filter(c =>
    c.topics.includes(topic) && c.severity !== 'info'
  );

  return {
    safe: topicConflicts.length === 0,
    conflicts: topicConflicts,
  };
}
