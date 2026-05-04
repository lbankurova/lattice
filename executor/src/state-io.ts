/**
 * State-file I/O primitives.
 *
 * State files (`.lattice/cycle-state/{topic}.yaml`, `.lattice/decisions.log`,
 * `.lattice/review-gate.json`, etc.) are read by every cycle workflow and
 * by `lattice status` / `lattice coherence` / `lattice autopilot`. Pre-fix
 * code wrote them via `writeFileSync(path, content)` directly -- which on
 * Windows can split into multiple WriteFile calls, exposing readers to
 * partial state.
 *
 * `atomicWriteFileSync` writes to a sibling `.tmp` file and then issues a
 * `rename`, which IS atomic on POSIX and on Windows for files on the same
 * volume. Closes CRITICAL-5 from the 2026-05-04 audit.
 */

import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
