/**
 * Skill-body re-rendering for project consumers.
 *
 * Closes the substitute-at-dispatch vs substitute-at-sync gap surfaced
 * during Phase 3b prep (decoupling-handoff.md §6 Phase 3): sync-skills.sh
 * copies raw template bodies into a project's `.claude/commands/`, but
 * direct Claude Code invocations of /ops:bug-stress etc. read those files
 * verbatim — they don't go through the executor's TemplateContext layer.
 * This module re-renders the synced bodies in-place against the project's
 * `lattice-project.toml` so the model sees substituted prompts regardless
 * of invocation path (executor or direct CLI).
 *
 * The post-commit hook in lattice/.git/hooks/post-commit calls
 * `lattice resync <project>` after sync-skills.sh completes its copy phase.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadManifest } from './manifest.js';
import { buildInitialContext, resolveTemplate, TemplateIncludeError } from './template.js';

export interface ResyncResult {
  rendered: number;
  unchanged: number;
  errors: { file: string; reason: string }[];
  sentinelFiles: string[];
  /**
   * Files where literal `{{...}}` template syntax survived substitution.
   * Cause: the rendered body contains a `{{X.Y}}` literal — almost certainly
   * inherited from an `{{include:...}}` source file that documented template
   * syntax without escaping it. Advisory; the next resync will mis-substitute
   * the literal as if it were a real token and emit `<<UNDEFINED:X.Y>>`. See
   * `lattice-project-spec.md` §3.1 Rule 5 (BUG-043 exemplar).
   *
   * Optional for additive-evolution compatibility — `resyncProject()` always
   * initializes it to `[]`, so consumers of this module's `resyncProject()`
   * return value can rely on it being defined. The optional marker exists to
   * preserve backward structural compatibility for external typed consumers
   * (e.g., test doubles constructed against an earlier `ResyncResult` shape).
   */
  strayTemplateFiles?: string[];
  hasManifest: boolean;
}

/**
 * Pattern the template engine matches when substituting tokens. Used here
 * to detect literal `{{...}}` syntax that survived substitution (i.e., was
 * baked into a rendered file by an upstream include rather than emitted by
 * the engine itself).
 *
 * Sentinels (`<<UNDEFINED:...>>`) are the OK shape for unresolved keys; they
 * use `<<...>>`, so this regex won't match them.
 */
const STRAY_TEMPLATE_RE = /\{\{[^}]+\}\}/;

/**
 * Re-render every `.md` file under <project-root>/.claude/commands/ against
 * the project's lattice-project.toml manifest, in-place.
 *
 * Files containing `<<UNDEFINED:...>>` sentinels after rendering are reported
 * but do not fail the run — skills needing the unresolved key abort at their
 * own boundary when invoked.
 *
 * Throws if `<project-root>/.claude/commands/` does not exist (caller decides
 * whether that's an error or a no-op).
 */
export function resyncProject(projectRoot: string): ResyncResult {
  const root = resolve(projectRoot);
  const commandsDir = resolve(root, '.claude/commands');
  if (!existsSync(commandsDir)) {
    throw new Error(`No .claude/commands/ at ${root}; nothing to render`);
  }

  const manifest = loadManifest(root);
  const ctx = buildInitialContext({}, {}, undefined, manifest);

  const files: string[] = [];
  walkSkillsDir(commandsDir, files);

  const result: ResyncResult = {
    rendered: 0, unchanged: 0, errors: [], sentinelFiles: [],
    strayTemplateFiles: [],
    hasManifest: manifest.hasProject,
  };

  for (const file of files) {
    const before = readFileSync(file, 'utf-8');
    let after: string;
    try {
      after = resolveTemplate(before, ctx);
    } catch (err) {
      const reason = err instanceof TemplateIncludeError
        ? err.message
        : err instanceof Error ? err.message : String(err);
      result.errors.push({ file, reason });
      continue;
    }

    if (after === before) {
      // Idempotent path: still scan for stray templates introduced by an
      // earlier resync (so the warning fires even when nothing changed
      // this run).
      if (STRAY_TEMPLATE_RE.test(after)) {
        result.strayTemplateFiles!.push(file);
      }
      result.unchanged++;
      continue;
    }

    if (/<<UNDEFINED:[^>]+>>/.test(after)) {
      result.sentinelFiles.push(file);
    }

    if (STRAY_TEMPLATE_RE.test(after)) {
      result.strayTemplateFiles!.push(file);
    }

    writeFileSync(file, after, 'utf-8');
    result.rendered++;
  }

  return result;
}

function walkSkillsDir(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkSkillsDir(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
}
