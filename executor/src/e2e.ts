/**
 * E2E Testing Gate — branch-comparison behavioral verification.
 *
 * Classifies testability from changed files, runs test suites on both
 * the base branch and the feature branch, diffs the results.
 *
 * Phase 1: exit_code and json_diff comparison modes, sequential suites.
 * Phase 2: text_diff, custom diff, parallel suites, screenshot perceptual diff.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import yaml from 'js-yaml';

// ── Types ───────────────────────────────────────────────────

export interface E2EConfig {
  testability: {
    e2e_testable: string[];
    code_review_only: string[];
  };
  suites: SuiteConfig[];
  setup?: string;
  teardown?: string;
  timeouts: {
    per_suite: number;
    total: number;
  };
  base_branch: string;
}

export interface SuiteConfig {
  name: string;
  command: string;
  comparison: 'exit_code' | 'json_diff';
  output_path?: string;
  setup?: string;
  teardown?: string;
  timeout?: number;
}

export type Classification = 'e2e_testable' | 'code_review_only' | 'skip';

export interface TestabilityResult {
  classification: Classification;
  e2eFiles: string[];
  reviewOnlyFiles: string[];
  unmatchedFiles: string[];
}

export interface SuiteRunResult {
  name: string;
  status: 'passed' | 'failed' | 'timeout' | 'error';
  exitCode: number;
  stdout: string;
  stderr: string;
  outputArtifact?: string;
  durationMs: number;
}

export interface SuiteComparison {
  name: string;
  comparison: SuiteConfig['comparison'];
  base: { status: SuiteRunResult['status']; exitCode: number };
  feature: { status: SuiteRunResult['status']; exitCode: number };
  verdict: 'pass' | 'fail' | 'skip';
  diff?: string;
}

export type ComparisonMode = 'branch' | 'uncommitted' | 'last-commit';

export interface E2EResult {
  timestamp: string;
  mode: ComparisonMode;
  classification: Classification;
  baseBranch: string;
  featureBranch: string;
  suites: SuiteComparison[];
  verdict: 'pass' | 'fail' | 'skip' | 'error';
  durationMs: number;
  error?: string;
}

// ── Config Loading ──────────────────────────────────────────

const DEFAULT_TIMEOUTS = { per_suite: 120_000, total: 600_000 };

/**
 * Snapshot the current dirty-tree path set. Mirrors autopilot.ts's
 * `captureDirtyPaths`. Used by the foreign-state guard in
 * `runBranchComparison`.
 */
function captureDirtyPaths(cwd: string): Set<string> {
  try {
    const out = execSync('git status --porcelain -z -uall', {
      cwd, encoding: 'utf-8', timeout: 10_000,
    });
    if (!out) return new Set();
    const files = new Set<string>();
    for (const part of out.split('\x00')) {
      if (part.length > 3) files.add(part.slice(3));
    }
    return files;
  } catch {
    return new Set();
  }
}

/**
 * Detect the repository's default branch via `git symbolic-ref refs/remotes/origin/HEAD`.
 * Falls back to scanning local branches for `master` or `main` (in that order, since
 * GitHub flipped its default mid-2020 — older repos still default to `master`).
 * Throws when none of the lookups resolve, so the caller surfaces a clear error
 * instead of silently producing `git rev-list main..HEAD` against a non-existent ref.
 */
export function detectDefaultBranch(cwd: string): string {
  try {
    const ref = execSync('git symbolic-ref --quiet refs/remotes/origin/HEAD', {
      cwd, encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // Form: "refs/remotes/origin/master" -> "master"
    const m = ref.match(/refs\/remotes\/origin\/(.+)$/);
    if (m) return m[1];
  } catch {
    // Origin HEAD not set — fall through to local-branch probe.
  }
  for (const candidate of ['master', 'main']) {
    try {
      execSync(`git rev-parse --verify --quiet refs/heads/${candidate}`, {
        cwd, encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      return candidate;
    } catch {
      // Not present, try next.
    }
  }
  throw new Error(
    "Could not determine default branch. Set 'origin/HEAD' " +
    "('git remote set-head origin --auto') or pin 'base_branch' in .lattice/e2e.yaml.",
  );
}

/**
 * Load E2E config from .lattice/e2e.yaml in the project root.
 * Returns null if no config file exists (E2E not configured).
 */
export function loadE2EConfig(projectRoot: string): E2EConfig | null {
  const configPath = resolve(projectRoot, '.lattice', 'e2e.yaml');
  if (!existsSync(configPath)) return null;

  const raw = yaml.load(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  const e2e = (raw?.['e2e'] ?? raw) as Record<string, unknown>;

  const testability = e2e['testability'] as Record<string, string[]> | undefined;
  const suites = (e2e['suites'] as SuiteConfig[] | undefined) ?? [];
  const timeouts = e2e['timeouts'] as Record<string, number> | undefined;

  return {
    testability: {
      e2e_testable: testability?.['e2e_testable'] ?? [],
      code_review_only: testability?.['code_review_only'] ?? [],
    },
    suites: suites.map(s => ({
      name: s.name,
      command: s.command,
      comparison: s.comparison ?? 'exit_code',
      output_path: s.output_path,
      setup: s.setup,
      teardown: s.teardown,
      timeout: s.timeout,
    })),
    setup: e2e['setup'] as string | undefined,
    teardown: e2e['teardown'] as string | undefined,
    timeouts: {
      per_suite: timeouts?.['per_suite'] ?? DEFAULT_TIMEOUTS.per_suite,
      total: timeouts?.['total'] ?? DEFAULT_TIMEOUTS.total,
    },
    base_branch: (e2e['base_branch'] as string) ?? detectDefaultBranch(projectRoot),
  };
}

// ── Glob Matching ───────────────────────────────────────────

/**
 * Minimal glob matcher for testability patterns.
 * Supports: ** (recursive), * (single segment wildcard), literal segments.
 */
function matchGlobSimple(pattern: string, filePath: string): boolean {
  // Convert glob pattern to regex
  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      // ** matches any number of path segments
      if (pattern[i + 2] === '/') {
        regex += '(?:.+/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
    } else if (pattern[i] === '*') {
      regex += '[^/]*';
      i++;
    } else if (pattern[i] === '.') {
      regex += '\\.';
      i++;
    } else {
      regex += pattern[i];
      i++;
    }
  }
  regex += '$';
  return new RegExp(regex).test(filePath);
}

// ── Comparison Mode Detection ───────────────────────────────

/**
 * Auto-detect which comparison mode to use:
 * 1. branch    — HEAD is ahead of base branch (feature branch workflow)
 * 2. uncommitted — working tree has changes on the base branch itself (trunk workflow)
 * 3. last-commit — clean tree on base branch, compare HEAD vs HEAD~1
 */
export function detectComparisonMode(baseBranch: string, cwd: string): ComparisonMode {
  // Check if HEAD is ahead of base.
  //
  // MEDIUM-5 fix from the 2026-05-04 audit: distinguish "rev-list returned 0
  // commits ahead" (HEAD == base) from "rev-list errored" (transient git
  // lock, missing ref, etc.). Pre-fix, both cases fell through to
  // 'uncommitted' silently -- but a transient git error is NOT semantically
  // equivalent to "no commits ahead" and would trigger uncommitted-mode
  // stash + run on a tree the caller didn't intend to test.
  //
  // We surface the failure as a thrown error rather than silent fallthrough.
  // The caller (runBranchComparison) catches and writes 'error' verdict.
  let ahead: number;
  try {
    const out = execSync(`git rev-list --count ${baseBranch}..HEAD`, {
      cwd, encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    ahead = parseInt(out, 10);
    if (Number.isNaN(ahead)) {
      throw new Error(`detectComparisonMode: rev-list returned non-numeric output: ${JSON.stringify(out)}`);
    }
  } catch (err) {
    // Distinguish "no such ref" from a transient failure. ENOENT-shaped
    // failures from git are diagnosable; surface them as e2e errors so the
    // caller doesn't silently fall through to uncommitted mode.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `detectComparisonMode: 'git rev-list --count ${baseBranch}..HEAD' failed -- ${msg}. ` +
      `Cannot determine whether HEAD is ahead of '${baseBranch}'. Verify the base branch exists ` +
      `(e.g., 'git fetch origin') or pin 'base_branch' explicitly in .lattice/e2e.yaml.`,
    );
  }
  if (ahead > 0) return 'branch';
  // ahead === 0 case (HEAD == base): legitimate fall-through to next mode.
  // Original try/catch wrapper preserved below for the porcelain check.
  // Check for uncommitted changes (staged + unstaged + untracked)
  try {
    const dirty = execSync('git status --porcelain', {
      cwd, encoding: 'utf-8', timeout: 5_000,
    }).trim();
    if (dirty) return 'uncommitted';
  } catch {
    // Fall through
  }

  // Clean tree, on base branch — compare last commit
  return 'last-commit';
}

// ── Testability Classification ──────────────────────────────

/**
 * Get changed files for the detected comparison mode.
 */
export function getChangedFiles(baseBranch: string, cwd: string, mode?: ComparisonMode): string[] {
  const effectiveMode = mode ?? detectComparisonMode(baseBranch, cwd);

  const run = (cmd: string): string[] => {
    try {
      const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 10_000 }).trim();
      return output ? output.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  switch (effectiveMode) {
    case 'branch':
      // Files changed between base and HEAD
      return run(`git diff --name-only ${baseBranch}...HEAD`);

    case 'uncommitted': {
      // Staged + unstaged changes vs HEAD
      const staged = run('git diff --cached --name-only');
      const unstaged = run('git diff --name-only');
      return [...new Set([...staged, ...unstaged])];
    }

    case 'last-commit':
      // Files changed in the most recent commit
      return run('git diff --name-only HEAD~1...HEAD');
  }
}

/**
 * Classify testability based on changed files and config patterns.
 * Any e2e_testable match means the whole changeset is e2e_testable.
 */
export function classifyTestability(
  changedFiles: string[],
  config: E2EConfig,
): TestabilityResult {
  if (changedFiles.length === 0) {
    return { classification: 'skip', e2eFiles: [], reviewOnlyFiles: [], unmatchedFiles: [] };
  }

  const e2eFiles: string[] = [];
  const reviewOnlyFiles: string[] = [];
  const unmatchedFiles: string[] = [];

  for (const file of changedFiles) {
    const isE2E = config.testability.e2e_testable.some(p => matchGlobSimple(p, file));
    const isReviewOnly = config.testability.code_review_only.some(p => matchGlobSimple(p, file));

    if (isE2E) {
      e2eFiles.push(file);
    } else if (isReviewOnly) {
      reviewOnlyFiles.push(file);
    } else {
      unmatchedFiles.push(file);
    }
  }

  // Any e2e file means the changeset needs E2E testing
  const classification: Classification = e2eFiles.length > 0
    ? 'e2e_testable'
    : 'code_review_only';

  return { classification, e2eFiles, reviewOnlyFiles, unmatchedFiles };
}

// ── Suite Execution ─────────────────────────────────────────

/**
 * Run a single test suite and capture results.
 */
function runSuite(suite: SuiteConfig, cwd: string, timeout: number): SuiteRunResult {
  const start = Date.now();
  const effectiveTimeout = suite.timeout ?? timeout;

  // Per-suite setup
  if (suite.setup) {
    try {
      execSync(suite.setup, { cwd, encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' });
    } catch (err) {
      return {
        name: suite.name,
        status: 'error',
        exitCode: -1,
        stdout: '',
        stderr: `Suite setup failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
    }
  }

  let result: SuiteRunResult;
  try {
    const stdout = execSync(suite.command, {
      cwd,
      encoding: 'utf-8',
      timeout: effectiveTimeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let outputArtifact: string | undefined;
    if (suite.output_path) {
      const artifactPath = resolve(cwd, suite.output_path);
      if (existsSync(artifactPath)) {
        outputArtifact = readFileSync(artifactPath, 'utf-8');
      }
    }

    result = {
      name: suite.name,
      status: 'passed',
      exitCode: 0,
      stdout: truncate(stdout, 5000),
      stderr: '',
      outputArtifact,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: string; stderr?: string; killed?: boolean };
    const isTimeout = execErr.killed === true;

    let outputArtifact: string | undefined;
    if (suite.output_path) {
      const artifactPath = resolve(cwd, suite.output_path);
      if (existsSync(artifactPath)) {
        outputArtifact = readFileSync(artifactPath, 'utf-8');
      }
    }

    result = {
      name: suite.name,
      status: isTimeout ? 'timeout' : 'failed',
      exitCode: execErr.status ?? 1,
      stdout: truncate(String(execErr.stdout ?? ''), 5000),
      stderr: truncate(String(execErr.stderr ?? ''), 2000),
      outputArtifact,
      durationMs: Date.now() - start,
    };
  }

  // Per-suite teardown (always runs)
  if (suite.teardown) {
    try {
      execSync(suite.teardown, { cwd, encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' });
    } catch {
      // Teardown failures are non-fatal
    }
  }

  return result;
}

function runAllSuites(
  suites: SuiteConfig[],
  cwd: string,
  config: E2EConfig,
): SuiteRunResult[] {
  const results: SuiteRunResult[] = [];
  for (const suite of suites) {
    results.push(runSuite(suite, cwd, config.timeouts.per_suite));
  }
  return results;
}

// ── Diff Logic ──────────────────────────────────────────────

/**
 * Compare base and feature results for a single suite.
 */
function compareSuite(
  suite: SuiteConfig,
  base: SuiteRunResult,
  feature: SuiteRunResult,
): SuiteComparison {
  const result: SuiteComparison = {
    name: suite.name,
    comparison: suite.comparison,
    base: { status: base.status, exitCode: base.exitCode },
    feature: { status: feature.status, exitCode: feature.exitCode },
    verdict: 'pass',
  };

  switch (suite.comparison) {
    case 'exit_code': {
      // Pass if same exit code, or feature improved (base failed, feature passed)
      if (base.exitCode === feature.exitCode) {
        result.verdict = 'pass';
      } else if (base.exitCode !== 0 && feature.exitCode === 0) {
        result.verdict = 'pass'; // Improvement
        result.diff = `Improved: base exit ${base.exitCode} -> feature exit 0`;
      } else {
        result.verdict = 'fail';
        result.diff = `Regression: base exit ${base.exitCode} -> feature exit ${feature.exitCode}`;
      }
      break;
    }

    case 'json_diff': {
      if (!base.outputArtifact && !feature.outputArtifact) {
        result.verdict = 'skip';
        result.diff = 'No output artifacts to compare';
        break;
      }
      if (!base.outputArtifact || !feature.outputArtifact) {
        result.verdict = 'fail';
        result.diff = `Missing artifact: base=${!!base.outputArtifact}, feature=${!!feature.outputArtifact}`;
        break;
      }

      try {
        const baseJson = JSON.parse(base.outputArtifact);
        const featureJson = JSON.parse(feature.outputArtifact);
        const diffs = diffJson(baseJson, featureJson, '');

        if (diffs.length === 0) {
          result.verdict = 'pass';
        } else {
          result.verdict = 'fail';
          result.diff = diffs.slice(0, 20).join('\n');
          if (diffs.length > 20) {
            result.diff += `\n... and ${diffs.length - 20} more differences`;
          }
        }
      } catch {
        // Not valid JSON — fall back to text comparison
        if (base.outputArtifact === feature.outputArtifact) {
          result.verdict = 'pass';
        } else {
          result.verdict = 'fail';
          result.diff = 'Output artifacts differ (non-JSON text comparison)';
        }
      }
      break;
    }
  }

  return result;
}

/**
 * Deep-diff two JSON values. Returns list of path-based change descriptions.
 */
function diffJson(base: unknown, feature: unknown, path: string): string[] {
  if (base === feature) return [];

  if (base === null || feature === null || typeof base !== typeof feature) {
    return [`${path || '(root)'}: ${summarizeValue(base)} -> ${summarizeValue(feature)}`];
  }

  if (Array.isArray(base) && Array.isArray(feature)) {
    const diffs: string[] = [];
    const maxLen = Math.max(base.length, feature.length);
    if (base.length !== feature.length) {
      diffs.push(`${path || '(root)'}: array length ${base.length} -> ${feature.length}`);
    }
    for (let i = 0; i < Math.min(maxLen, 10); i++) {
      diffs.push(...diffJson(base[i], feature[i], `${path}[${i}]`));
    }
    if (maxLen > 10) {
      diffs.push(`${path}: ... (${maxLen - 10} more elements not compared)`);
    }
    return diffs;
  }

  if (typeof base === 'object' && typeof feature === 'object') {
    const diffs: string[] = [];
    const baseObj = base as Record<string, unknown>;
    const featureObj = feature as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(baseObj), ...Object.keys(featureObj)]);

    for (const key of allKeys) {
      const subPath = path ? `${path}.${key}` : key;
      if (!(key in baseObj)) {
        diffs.push(`${subPath}: ADDED ${summarizeValue(featureObj[key])}`);
      } else if (!(key in featureObj)) {
        diffs.push(`${subPath}: REMOVED ${summarizeValue(baseObj[key])}`);
      } else {
        diffs.push(...diffJson(baseObj[key], featureObj[key], subPath));
      }
    }
    return diffs;
  }

  return [`${path || '(root)'}: ${summarizeValue(base)} -> ${summarizeValue(feature)}`];
}

function summarizeValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v.length > 40 ? `"${v.slice(0, 40)}..."` : `"${v}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[array(${v.length})]`;
  return `{object(${Object.keys(v as Record<string, unknown>).length})}`;
}

// ── E2E Gate Runner ─────────────────────────────────────────

/**
 * Run the E2E gate. Auto-detects comparison mode:
 * - branch:      checkout base → run → checkout feature → run → diff
 * - uncommitted:  stash → run (clean) → pop → run (dirty) → diff
 * - last-commit: checkout HEAD~1 → run → checkout HEAD → run → diff
 *
 * Guarantees:
 * - Always returns to the original branch/state
 * - Always pops stash if pushed
 * - Always runs teardown
 * - Always writes result file (even on error)
 */
export function runBranchComparison(
  config: E2EConfig,
  cwd: string,
  baseBranch?: string,
): E2EResult {
  const start = Date.now();
  const effectiveBase = baseBranch ?? config.base_branch;
  const mode = detectComparisonMode(effectiveBase, cwd);
  let originalBranch = '';
  let stashed = false;

  const result: E2EResult = {
    timestamp: new Date().toISOString(),
    mode,
    classification: 'e2e_testable',
    baseBranch: effectiveBase,
    featureBranch: '',
    suites: [],
    verdict: 'error',
    durationMs: 0,
  };

  try {
    // 1. Record current branch
    originalBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd, encoding: 'utf-8', timeout: 5_000,
    }).trim();
    result.featureBranch = originalBranch;

    // 2. Classify testability
    const changedFiles = getChangedFiles(effectiveBase, cwd, mode);
    const testability = classifyTestability(changedFiles, config);
    result.classification = testability.classification;

    if (testability.classification === 'code_review_only' || testability.classification === 'skip') {
      result.verdict = 'skip';
      result.durationMs = Date.now() - start;
      return result;
    }

    // 3. Dispatch by mode
    let baseResults: SuiteRunResult[];
    let featureResults: SuiteRunResult[];

    // Foreign-state guard (HIGH-2 fix, 2026-05-04 audit). e2e mutates the
    // working tree (stash, checkout base, run suites, restore). Pre-fix
    // versions ran an unscoped `git stash push` that captured ANY dirty
    // path -- including a parallel session's uncommitted work -- and on
    // stash-pop conflict left it in a stash the operator had to recover
    // manually. Now: refuse to run when the working tree contains paths
    // not in the diff scope this e2e is testing. The framework's other
    // safety guarantees (lock ownership, autopilot foreign-state respect)
    // assume each session can recognize and refuse to mutate state it
    // doesn't own; e2e was the missing instance.
    const dirtyPaths = captureDirtyPaths(cwd);
    const expectedScope = new Set(changedFiles);
    const foreign = [...dirtyPaths].filter(p => !expectedScope.has(p));
    if (foreign.length > 0 && (mode === 'branch' || mode === 'uncommitted')) {
      const sample = foreign.slice(0, 5).join(', ');
      const more = foreign.length > 5 ? ` (and ${foreign.length - 5} more)` : '';
      result.error =
        `e2e refused to run: working tree has ${foreign.length} dirty path(s) outside the diff scope. ` +
        `These look foreign (parallel session, manual edits, or unrelated WIP). ` +
        `Commit, stash, or discard them before running e2e. Foreign paths: ${sample}${more}`;
      result.verdict = 'error';
      result.durationMs = Date.now() - start;
      return result;
    }

    switch (mode) {
      case 'branch': {
        // Stash any dirty work (now known to be in-scope), checkout base,
        // run, checkout feature, run.
        const dirty = git('status --porcelain', cwd).trim();
        if (dirty) {
          git('stash push -m "lattice-e2e-gate"', cwd);
          stashed = true;
        }

        git(`checkout ${effectiveBase}`, cwd);
        baseResults = runWithSetupTeardown(config, cwd);

        git(`checkout ${originalBranch}`, cwd);
        if (stashed) {
          try { git('stash pop', cwd); stashed = false; } catch {
            result.error = 'WARNING: git stash pop failed (conflict). Run `git stash pop` manually.';
          }
        }
        featureResults = runWithSetupTeardown(config, cwd);
        break;
      }

      case 'uncommitted': {
        // Stash in-scope changes → run (clean HEAD) → pop → run (with changes)
        git('stash push -m "lattice-e2e-gate"', cwd);
        stashed = true;

        baseResults = runWithSetupTeardown(config, cwd);

        try { git('stash pop', cwd); stashed = false; } catch {
          result.error = 'WARNING: git stash pop failed (conflict). Run `git stash pop` manually.';
        }
        featureResults = runWithSetupTeardown(config, cwd);
        break;
      }

      case 'last-commit': {
        // Checkout HEAD~1, run, checkout HEAD, run
        const headRef = git('rev-parse HEAD', cwd).trim();
        git('checkout HEAD~1', cwd);
        baseResults = runWithSetupTeardown(config, cwd);

        git(`checkout ${headRef}`, cwd);
        featureResults = runWithSetupTeardown(config, cwd);
        break;
      }
    }

    // 4. Compare results
    const comparisons: SuiteComparison[] = [];
    for (let i = 0; i < config.suites.length; i++) {
      comparisons.push(compareSuite(config.suites[i], baseResults[i], featureResults[i]));
    }

    result.suites = comparisons;
    result.verdict = comparisons.every(c => c.verdict !== 'fail') ? 'pass' : 'fail';

  } catch (err) {
    result.verdict = 'error';
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    // Guarantee: return to original branch
    if (originalBranch) {
      try {
        const current = git('rev-parse --abbrev-ref HEAD', cwd).trim();
        if (current !== originalBranch) {
          git(`checkout ${originalBranch}`, cwd);
        }
      } catch { /* best-effort */ }
    }

    // Guarantee: pop stash if still pending
    if (stashed) {
      try { git('stash pop', cwd); } catch { /* best-effort */ }
    }

    // Guarantee: run teardown
    if (config.teardown) {
      try {
        execSync(config.teardown, { cwd, encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' });
      } catch { /* non-fatal */ }
    }

    result.durationMs = Date.now() - start;
  }

  return result;
}

/** Run setup → all suites → teardown. Returns suite results. */
function runWithSetupTeardown(config: E2EConfig, cwd: string): SuiteRunResult[] {
  if (config.setup) {
    execSync(config.setup, { cwd, encoding: 'utf-8', timeout: 60_000, stdio: 'pipe' });
  }
  const results = runAllSuites(config.suites, cwd, config);
  if (config.teardown) {
    try {
      execSync(config.teardown, { cwd, encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' });
    } catch { /* non-fatal */ }
  }
  return results;
}

/** Shorthand for git commands. Throws on failure. */
function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, {
    cwd, encoding: 'utf-8', timeout: 30_000, stdio: 'pipe',
  });
}

// ── Result Persistence ──────────────────────────────────────

/**
 * Write E2E result to disk for workflow gate consumption.
 */
export function writeE2EResult(result: E2EResult, projectRoot: string): void {
  const resultPath = resolve(projectRoot, '.lattice', 'e2e-result.json');
  const dir = dirname(resultPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
}

/**
 * Read last E2E result from disk. Returns null if none exists.
 */
export function readE2EResult(projectRoot: string): E2EResult | null {
  const resultPath = resolve(projectRoot, '.lattice', 'e2e-result.json');
  if (!existsSync(resultPath)) return null;
  try {
    return JSON.parse(readFileSync(resultPath, 'utf-8')) as E2EResult;
  } catch {
    return null;
  }
}

// ── Formatting ──────────────────────────────────────────────

/**
 * Format E2E result for terminal output.
 */
export function formatE2EResult(result: E2EResult): string {
  const lines: string[] = [];

  lines.push('========================================');
  lines.push('  E2E Testing Gate');
  lines.push('========================================');
  lines.push('');
  const modeLabel = result.mode === 'branch' ? 'branch comparison'
    : result.mode === 'uncommitted' ? 'uncommitted changes'
    : 'last commit (HEAD vs HEAD~1)';
  lines.push(`  Mode:            ${modeLabel}`);
  lines.push(`  Classification:  ${result.classification}`);
  lines.push(`  Base:            ${result.mode === 'last-commit' ? 'HEAD~1' : result.baseBranch}`);
  lines.push(`  Current:         ${result.featureBranch}`);
  lines.push(`  Duration:        ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push('');

  if (result.verdict === 'skip') {
    lines.push('  SKIPPED: No E2E-testable files changed.');
    return lines.join('\n');
  }

  if (result.verdict === 'error') {
    lines.push(`  ERROR: ${result.error}`);
    return lines.join('\n');
  }

  // Suite results table
  lines.push('  Suite results:');
  lines.push('  ' + '-'.repeat(60));
  lines.push(`  ${'Suite'.padEnd(20)} ${'Base'.padEnd(10)} ${'Feature'.padEnd(10)} Verdict`);
  lines.push('  ' + '-'.repeat(60));

  for (const suite of result.suites) {
    const icon = suite.verdict === 'pass' ? 'PASS' : suite.verdict === 'fail' ? 'FAIL' : 'SKIP';
    lines.push(
      `  ${suite.name.padEnd(20)} ${suite.base.status.padEnd(10)} ${suite.feature.status.padEnd(10)} ${icon}`
    );
  }

  lines.push('  ' + '-'.repeat(60));
  lines.push('');

  // Show diffs for failures
  const failures = result.suites.filter(s => s.verdict === 'fail');
  if (failures.length > 0) {
    lines.push('  Differences:');
    for (const f of failures) {
      lines.push(`    [${f.name}] ${f.diff ?? 'no diff detail'}`);
    }
    lines.push('');
  }

  const verdictLabel = result.verdict === 'pass' ? 'PASS' : 'FAIL';
  lines.push(`  Verdict: ${verdictLabel}`);
  if (result.error) {
    lines.push(`  Warning: ${result.error}`);
  }
  lines.push('========================================');

  return lines.join('\n');
}

/**
 * Format classification result for terminal output.
 */
export function formatClassification(
  testability: TestabilityResult,
  changedFiles: string[],
  mode?: ComparisonMode,
): string {
  const lines: string[] = [];
  if (mode) lines.push(`mode: ${mode}`);
  lines.push(`classification: ${testability.classification}`);
  lines.push(`changed_files: ${changedFiles.length}`);
  lines.push(`e2e_testable: ${testability.e2eFiles.length}`);
  lines.push(`code_review_only: ${testability.reviewOnlyFiles.length}`);
  lines.push(`unmatched: ${testability.unmatchedFiles.length}`);

  if (testability.e2eFiles.length > 0 && testability.e2eFiles.length <= 10) {
    lines.push('');
    lines.push('E2E files:');
    for (const f of testability.e2eFiles) lines.push(`  ${f}`);
  }

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (truncated, ${s.length - max} chars omitted)`;
}
