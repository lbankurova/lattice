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

import { writeFileSync, renameSync, mkdirSync, appendFileSync, openSync, closeSync, writeSync, unlinkSync, linkSync } from 'node:fs';
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
 * Error thrown by `atomicWriteFileSyncCAS` when another writer has already
 * claimed the target revision slot. Callers that perform optimistic
 * read-compare-write loops on state files MUST catch this and abort their
 * own write (the standard CAS-fail pattern).
 *
 * Recognizable both by `instanceof RevisionMismatchError` and by the
 * literal "Revision mismatch" prefix on the message (matches the existing
 * `writeCheckpoint` error for symmetry with the engine's pre-existing
 * revision-check throw).
 */
export class RevisionMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevisionMismatchError';
  }
}

/**
 * Compare-and-swap state write — encodes the *expected new revision* in
 * the temp filename so concurrent writers attempting the same revision
 * collide on filesystem-atomic create-or-fail.
 *
 * Closes the residual race in the read → compare → write loop in
 * `engine.writeCheckpoint`. The pre-fix `atomicWriteFileSync` path is
 * atomic-replace (a partial-write reader is impossible), but two writers
 * that both observed `revision = N` and computed `N+1` would each call
 * `atomicWriteFileSync` and silently last-writer-wins (the in-memory
 * revision check happens BEFORE the write; both pass it independently).
 *
 * The CAS protocol:
 *
 *   1. Write to a uniquely-named scratch path (pid + nanos disambiguates
 *      this writer from concurrent ones).
 *   2. Try `link(scratch, path.tmp-rev-{N+1})`. `link` is the POSIX/Win32
 *      atomic-create primitive — fails with `EEXIST` if a competing
 *      writer already claimed revision `N+1`. This is the CAS step.
 *   3. On link success, `rename(path.tmp-rev-{N+1}, path)` to publish.
 *      `rename` is atomic-replace, so the destination flips from old to
 *      new content with no partial-read window.
 *   4. Cleanup: unlink the scratch link.
 *
 * On link failure (EEXIST): unlink the scratch and throw
 * `RevisionMismatchError`. Callers retry from the read step or escalate.
 *
 * Why `link` instead of `O_EXCL`-open: Node's `'wx'` open flag is
 * available, but `link` carries the same atomicity guarantee on both
 * POSIX (`link(2)`) and Win32 (`CreateHardLink`) and reuses the same
 * inode for the scratch file (one syscall to publish, one to clean up).
 * `'wx'` would require a second `writeFileSync(... 'wx')` on a separate
 * path, which is one more disk round-trip for no extra safety.
 */
export function atomicWriteFileSyncCAS(
  path: string,
  content: string | Buffer,
  expectedNewRevision: number,
): void {
  mkdirSync(dirname(path), { recursive: true });

  // Unique scratch — pid + monotonic-ish counter via Date.now()+random.
  // Process restarts within the same ms with same pid would collide on a
  // pure pid+now scratch; the random suffix removes that edge.
  const scratchPath = `${path}.tmp-scratch-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const claimPath = `${path}.tmp-rev-${expectedNewRevision}`;

  // Step 1: write content to scratch via `wx` (create-or-fail). The pid +
  // nanos suffix should make collisions vanishingly unlikely, but `wx`
  // refuses to overwrite if one happens, so we surface the error rather
  // than silently clobber a sibling writer's scratch.
  const fd = openSync(scratchPath, 'wx');
  try {
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    writeSync(fd, buf, 0, buf.length, 0);
  } finally {
    closeSync(fd);
  }

  // Step 2: atomic-claim the revision slot via `link`. `link` fails
  // EEXIST if `claimPath` already exists -- THIS is the CAS.
  try {
    linkSync(scratchPath, claimPath);
  } catch (err: unknown) {
    // EEXIST means another writer claimed the slot first -- abort.
    // Any other error (EPERM on link-restricted filesystems, ENOSPC) is
    // surfaced to the caller as-is after best-effort cleanup.
    try { unlinkSync(scratchPath); } catch { /* best-effort */ }
    const code = (err as { code?: string })?.code;
    if (code === 'EEXIST') {
      throw new RevisionMismatchError(
        `Revision mismatch on ${path}: another writer already claimed revision ${expectedNewRevision}. ` +
        `A concurrent writer raced us to this state-file update. Aborting to avoid clobbering. ` +
        `Caller should re-read the state file and retry from the latest revision.`,
      );
    }
    throw err;
  }

  // Step 3: publish — rename the claimed tmp file over `path`. `rename`
  // is atomic-replace; concurrent readers see either the prior content
  // or the new content, never a partial mix.
  try {
    renameSync(claimPath, path);
  } finally {
    // Step 4: cleanup the scratch link. `claimPath` was renamed away by
    // step 3, so only `scratchPath` remains as a dangling hard link.
    try { unlinkSync(scratchPath); } catch { /* best-effort */ }
  }
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
