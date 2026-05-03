/**
 * TODO queue loader for autopilot.
 *
 * Parses a project's TODO.md (typically docs/_internal/TODO.md), extracts
 * sections tagged `autopilot: ready` with optional `score:` and `kind:`
 * fields, and produces items the autopilot can route through existing cycle
 * workflows (research-cycle / spike-cycle / bug-fix-cycle).
 *
 * Mechanical items (no `kind:` field, or `kind: mechanical`) are NOT handled
 * by the executor — they require free-form direct edits feasible only from
 * a Claude-skill session. They are returned with kind = 'mechanical' so the
 * caller can surface them as "skill-only" rather than dropping them silently.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type TodoKind = 'research' | 'spike' | 'bugfix' | 'mechanical';

export interface TodoItem {
  /** Stable id from header (e.g., "GAP-263", "DATA-GAP-HCD-HET-06"). */
  id: string;
  /** Header text without the "### " prefix. */
  header: string;
  /** Score 0-27 from pillars × data × impl rubric. 0 if unspecified. */
  score: number;
  /** Routing kind. 'mechanical' when no `kind:` field is present. */
  kind: TodoKind;
}

const TODO_CANDIDATE_PATHS = [
  'docs/_internal/TODO.md',
  'TODO.md',
  'docs/TODO.md',
];

const AUTOPILOT_RE = /^\s*-\s*\*\*autopilot:\*\*\s+(\S+)/m;
const SCORE_RE = /_score:\s*(\d+)_/;
const KIND_RE = /^\s*-\s*\*\*kind:\*\*\s+(\S+)/m;
const VALID_KINDS = new Set<TodoKind>(['research', 'spike', 'bugfix', 'mechanical']);

/**
 * Find the project's TODO.md file. Returns absolute path or null.
 */
export function findTodoFile(cwd: string): string | null {
  for (const candidate of TODO_CANDIDATE_PATHS) {
    const full = resolve(cwd, candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

/**
 * Parse TODO.md text into ready items. Strikethrough and resolved sections
 * are skipped.
 */
export function parseTodoMd(text: string): TodoItem[] {
  const items: TodoItem[] = [];
  for (const { header, body } of splitSections(text)) {
    // Skip strikethrough/resolved
    const stripped = header.replace(/^###\s+/, '');
    if (stripped.startsWith('~~')) continue;
    if (/\b(RESOLVED|SUBSUMED|RETRACTED|SUPERSEDED)\b/.test(header)) continue;

    const tagMatch = AUTOPILOT_RE.exec(body);
    if (!tagMatch || tagMatch[1] !== 'ready') continue;

    const id = extractId(stripped);
    if (!id) continue;

    const scoreMatch = SCORE_RE.exec(body);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

    const kindMatch = KIND_RE.exec(body);
    const rawKind = kindMatch ? kindMatch[1] : 'mechanical';
    const kind: TodoKind = VALID_KINDS.has(rawKind as TodoKind)
      ? (rawKind as TodoKind)
      : 'mechanical';

    items.push({ id, header: stripped, score, kind });
  }
  return items;
}

/**
 * Load the TODO queue for the given project. Empty array when no TODO file
 * exists — never throws.
 */
export function loadTodoQueue(cwd: string): TodoItem[] {
  const path = findTodoFile(cwd);
  if (!path) return [];
  try {
    const text = readFileSync(path, 'utf-8');
    return parseTodoMd(text);
  } catch {
    return [];
  }
}

/**
 * Map a TODO item to the cycle workflow that should advance it. Returns null
 * for kinds the executor cannot handle (mechanical — Claude-skill territory).
 */
export function getTodoAdvanceAction(
  item: TodoItem,
): { workflow: string; description: string } | null {
  switch (item.kind) {
    case 'research':
      return {
        workflow: 'research-cycle',
        description: `TODO ${item.id}: research-cycle`,
      };
    case 'spike':
      return {
        workflow: 'spike-cycle',
        description: `TODO ${item.id}: spike-cycle`,
      };
    case 'bugfix':
      return {
        workflow: 'bug-fix-cycle',
        description: `TODO ${item.id}: bug-fix-cycle`,
      };
    case 'mechanical':
      return null;
  }
}

function extractId(headerText: string): string | null {
  // Header shape: "ID: description ..." or "ID -- description ..." or just "ID".
  // Take the first whitespace/colon-delimited token.
  const match = headerText.match(/^([A-Za-z][\w-]*)/);
  return match ? match[1] : null;
}

function splitSections(text: string): { header: string; body: string }[] {
  const sections: { header: string; body: string }[] = [];
  let currentHeader: string | null = null;
  let currentBody: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('### ')) {
      if (currentHeader !== null) {
        sections.push({ header: currentHeader, body: currentBody.join('\n') });
      }
      currentHeader = line;
      currentBody = [];
    } else if (currentHeader !== null) {
      currentBody.push(line);
    }
  }
  if (currentHeader !== null) {
    sections.push({ header: currentHeader, body: currentBody.join('\n') });
  }
  return sections;
}
