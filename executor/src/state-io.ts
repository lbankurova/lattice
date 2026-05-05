/**
 * State-file I/O primitives — safe operations in the presence of concurrent
 * sessions.
 *
 * Two responsibilities:
 *
 * 1. **Atomic state writes.** `atomicWriteFileSync` replaces `writeFileSync`
 *    at every state-file write (cycle-state YAMLs, decisions.log,
 *    review-gate.json). Pre-fix `writeFileSync(path, content)` could split
 *    into multiple WriteFile calls on Windows, exposing concurrent readers
 *    to partial state. Closes CRITICAL-5 from the 2026-05-04 audit.
 *
 * 2. **Dirty-tree snapshot for ownership tracking.** `captureDirtyPaths`
 *    enumerates the working tree's currently-dirty paths (modified +
 *    untracked). Used by autopilot's foreign-state stash guard (the seed
 *    bug from 2026-05-04) and by e2e's branch-mode foreign-state refusal
 *    (HIGH-2). Single source of truth so both consumers see identical
 *    porcelain parsing.
 */

import { writeFileSync, renameSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Atomic-replace write: write to `<path>.tmp`, then rename to `<path>`.
 *
 * Concurrent readers either observe the previous content (before rename)
 * or the new content (after rename) -- never a partial mix. Fails the same
 * way `writeFileSync` would (caller handles).
 *
 * Note: the `.tmp` sibling is created in the same directory as `path`, not
 * in `os.tmpdir()`. This is required because `rename` is only atomic when
 * source and destination are on the same filesystem.
 */
export function atomicWriteFileSync(path: string, content: string | Buffer): void {
  const tmpPath = `${path}.tmp`;
  // Ensure parent directory exists. Pre-fix code relied on the dir being
  // created elsewhere (e.g., the user setting up `.lattice/`); making the
  // helper self-sufficient avoids ENOENT cascades when state files land
  // in directories that haven't been touched yet.
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmpPath, content, typeof content === 'string' ? 'utf-8' : undefined);
  renameSync(tmpPath, path);
}

/**
 * Snapshot the current dirty-tree path set via
 * `git status --porcelain -z -uall`.
 *
 * Returns a Set of paths (relative to the repo root) that are modified,
 * staged, or untracked. Returns an empty Set on any git failure -- callers
 * are expected to treat empty as "clean tree" and proceed safely.
 *
 * Used as the per-item snapshot for ownership tracking. Two consumers:
 *
 * - autopilot.ts: snapshots BEFORE running each workflow item; computes
 *   `(post − pre)` as the workflow's own dirty paths; stashes only those.
 *   Foreign paths (in pre-snapshot) are never touched. This was the seed
 *   bug from 2026-05-04 -- pre-fix `git stash push -u` swept ~2300 LOC of
 *   a parallel session into a stash labeled with autopilot's failing topic.
 *
 * - e2e.ts: snapshots before runBranchComparison; refuses to run when the
 *   working tree contains paths NOT in the diff scope being tested
 *   (HIGH-2 fix).
 *
 * Renames split as "XY new\\0old" in the porcelain-z stream; we treat
 * both halves as dirty (safe for ownership: both would be excluded if
 * either was pre-dirty, and stashing both if workflow-owned just stashes
 * the pair).
 */
/**
 * Maximum byte length of a single appended line for atomicity.
 *
 * `appendFileSync` opens with `O_APPEND` and writes in one syscall. POSIX
 * guarantees write atomicity for `O_APPEND` writes up to `PIPE_BUF`
 * (4096 bytes on Linux). On Windows there is no PIPE_BUF, but small
 * writes via `WriteFile` on a file opened with `FILE_APPEND_DATA` are
 * effectively atomic because the seek-and-write happens under a single
 * file-system lock. The conservative cap below is well under both
 * boundaries while still fitting realistic log entries (TSV decisions
 * rows are typically < 300 bytes; JSONL telemetry rows < 800 bytes).
 *
 * Closes MEDIUM-4 from the 2026-05-04 audit -- pre-fix `appendFileSync`
 * was used directly with no length check, so a long entry (e.g., huge
 * model name + stack trace summary) could exceed PIPE_BUF and interleave
 * with a concurrent appender.
 */
const APPEND_LINE_CAP_BYTES = 3500;

/**
 * Atomic append of a single line to a file. Returns true on success.
 *
 * - Adds a trailing newline if `line` doesn't already end with one.
 * - Truncates with a `[truncated]` suffix if the line exceeds the cap,
 *   preserving atomicity. Truncation is logged via stderr so callers
 *   can detect the loss when investigating later.
 * - Best-effort: any exception is swallowed and the function returns
 *   false (callers treat append-log writes as advisory).
 *
 * The cap is intentionally conservative: PIPE_BUF on Linux is 4096; on
 * Windows the boundary is harder to pin down but small-write atomicity
 * holds well under 4 KB. Using 3500 leaves margin for the trailing
 * newline and any encoding overhead.
 */
export function safeAppendLineSync(path: string, line: string): boolean {
  let entry = line.endsWith('\n') ? line : line + '\n';
  const bytes = Buffer.byteLength(entry, 'utf-8');
  if (bytes > APPEND_LINE_CAP_BYTES) {
    const suffix = '...[truncated]\n';
    const room = APPEND_LINE_CAP_BYTES - Buffer.byteLength(suffix, 'utf-8');
    // Truncate by string length first, then nudge down until byte length fits.
    let truncated = entry.slice(0, room);
    while (Buffer.byteLength(truncated + suffix, 'utf-8') > APPEND_LINE_CAP_BYTES && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    entry = truncated + suffix;
    process.stderr.write(`[state-io] safeAppendLineSync: truncated entry from ${bytes}B to ${entry.length}B for ${path}\n`);
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, entry, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function captureDirtyPaths(cwd: string): Set<string> {
  try {
    const out = execSync('git status --porcelain -z -uall', {
      cwd, encoding: 'utf-8', timeout: 10_000,
    });
    if (!out) return new Set();
    const files = new Set<string>();
    for (const part of out.split('\x00')) {
      // Porcelain -z entries: "XY filename" (XY = 2-char status, then space).
      if (part.length > 3) files.add(part.slice(3));
    }
    return files;
  } catch {
    return new Set();
  }
}
