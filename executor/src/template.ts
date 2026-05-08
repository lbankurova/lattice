/**
 * Template engine for variable substitution in workflow nodes.
 *
 * Resolves {{inputs.topic}}, {{nodes.X.output}}, {{nodes.X.output.field}},
 * {{state.phase}}, {{env.TIMESTAMP}} patterns.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NodeResult } from './types.js';
import { lookupKey, formatValue, type Manifest } from './manifest.js';

export interface TemplateContext {
  inputs: Record<string, string | number | boolean>;
  nodes: Record<string, NodeResult>;
  state: Record<string, string>;
  env: Record<string, string>;
  /**
   * Project + platform manifest (lattice-project.toml, lattice-platform.toml).
   * Optional for back-compat with callers that don't load a manifest.
   * When undefined, {{lattice.x.y}} / {{platform.x.y}} / {{include:project.x.y}}
   * tokens emit the UNDEFINED sentinel (or throw, for include:).
   */
  manifest?: Manifest;
}

/**
 * Error thrown when a {{include:...}} token cannot be satisfied.
 * Surfaces both the token expression and the underlying reason so a skill
 * author can see exactly which TOML key was missing or which file path
 * resolved nowhere.
 */
export class TemplateIncludeError extends Error {
  constructor(public readonly expression: string, reason: string) {
    super(`{{${expression}}}: ${reason}`);
    this.name = 'TemplateIncludeError';
  }
}

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

/**
 * Resolve all {{...}} templates in a string.
 */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(TEMPLATE_RE, (_match, expr: string) => {
    const value = resolveExpression(expr.trim(), ctx);
    return value ?? '';
  });
}

/**
 * Resolve all templates in an object tree (strings, arrays, plain objects).
 */
export function resolveTemplates<T>(obj: T, ctx: TemplateContext): T {
  if (typeof obj === 'string') {
    return resolveTemplate(obj, ctx) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolveTemplates(item, ctx)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveTemplates(value, ctx);
    }
    return result as T;
  }
  return obj;
}

/**
 * Resolve a single dot-notation expression against the context.
 *
 * Supported namespaces:
 *   inputs.X              - workflow input by name
 *   nodes.X.output        - node output (full text); .output.field extracts JSON/KV
 *   nodes.X.exit_code     - node exit code
 *   nodes.X.status        - node status string
 *   nodes.X.route         - gate route
 *   state.X               - cycle-state key
 *   env.X                 - executor env var (TIMESTAMP, LATTICE_ROOT, ...)
 *   lattice.X.Y[.Z...]    - dotted lookup in manifest.project (lattice-project.toml).
 *                           Undefined keys substitute as `<<UNDEFINED:X.Y>>`.
 *   platform.X.Y[.Z...]   - dotted lookup in manifest.platform (lattice-platform.toml).
 *                           Same undefined semantics.
 *   include:project.X.Y   - looks up a path in manifest.project at X.Y;
 *                           reads that file's contents and returns them inline.
 *                           Throws TemplateIncludeError if the key is undefined,
 *                           empty, or points to a missing file.
 *   include:optional:project.X.Y
 *                         - same as include:project but emits empty string
 *                           (instead of throwing) when the key is undefined,
 *                           the manifest is absent, the value is the empty-string
 *                           marker, or the file does not exist. A wrong-type
 *                           value (key present but not a string) STILL throws --
 *                           that's a misconfiguration, not absence.
 */
function resolveExpression(expr: string, ctx: TemplateContext): string | undefined {
  // include:project.x.y - file content inclusion (separate from dot-namespace dispatch).
  if (expr.startsWith('include:')) {
    return resolveInclude(expr.slice('include:'.length).trim(), expr, ctx);
  }

  const parts = expr.split('.');

  if (parts.length < 2) return undefined;

  const root = parts[0];

  switch (root) {
    case 'inputs':
      return String(ctx.inputs[parts[1]] ?? '');

    case 'lattice': {
      // {{lattice.x.y[.z...]}} - lookup in manifest.project
      const dotted = parts.slice(1).join('.');
      if (!ctx.manifest) {
        return `<<UNDEFINED:lattice.${dotted}>>`;
      }
      return formatValue(lookupKey(ctx.manifest.project, dotted), `lattice.${dotted}`);
    }

    case 'platform': {
      // {{platform.x.y[.z...]}} - lookup in manifest.platform
      const dotted = parts.slice(1).join('.');
      if (!ctx.manifest) {
        return `<<UNDEFINED:platform.${dotted}>>`;
      }
      return formatValue(lookupKey(ctx.manifest.platform, dotted), `platform.${dotted}`);
    }

    case 'nodes': {
      // {{nodes.X.output}} or {{nodes.X.output.field}}
      const nodeId = parts[1];
      const nodeResult = ctx.nodes[nodeId];
      if (!nodeResult) return '';

      // Dry-run: refuse to substitute synthetic outputs into downstream
      // nodes. Silently propagating "(dry run)" into bash commands or gate
      // conditions made dry-runs appear to "complete" while feeding garbage
      // through the DAG. Throw loudly so the caller sees the dependency.
      // status/exit_code/route are still safe to read (status='completed'
      // is a meaningful planning signal). Only output substitution throws.
      if (nodeResult.dryRun && parts[2] === 'output') {
        throw new Error(
          `Template references {{nodes.${nodeId}.${parts.slice(2).join('.')}}} but '${nodeId}' was not executed (dry-run mode). ` +
          `Dry-run only validates the execution plan; it cannot satisfy data-flow templates. ` +
          `Run without --dry-run to execute, or remove the {{nodes.${nodeId}.output...}} reference from this node.`
        );
      }

      if (parts[2] === 'output') {
        if (parts.length === 3) {
          // {{nodes.X.output}} -- full output text
          return nodeResult.output;
        }
        // {{nodes.X.output.field}} -- parse as JSON, extract field
        return extractJsonField(nodeResult.output, parts[3]);
      }
      if (parts[2] === 'exit_code') {
        return String(nodeResult.exitCode ?? '');
      }
      if (parts[2] === 'status') {
        return nodeResult.status;
      }
      if (parts[2] === 'route') {
        return nodeResult.route ?? '';
      }
      return '';
    }

    case 'state':
      return ctx.state[parts[1]] ?? '';

    case 'env':
      return ctx.env[parts[1]] ?? '';

    default:
      return undefined;
  }
}

/**
 * Resolve `{{include:project.X.Y}}` into the contents of the file pointed to
 * by manifest.project at X.Y.
 *
 * Spec: "The file path resolves relative to the project root. The file's full
 * contents are inlined into the skill body as a single block. If the file does
 * not exist, substitution emits a sentinel and the skill aborts (multi-paragraph
 * content is always required when its key is set)." (lattice-project-spec.md §3)
 *
 * Implementation choice: we throw TemplateIncludeError so the caller can decide
 * whether to abort the whole skill dispatch or fall back. The previous text-only
 * sentinel approach made it possible for skill bodies to silently substitute
 * `<<UNDEFINED:...>>` and run anyway with corrupted prompts.
 *
 * Optional form: `{{include:optional:project.X.Y}}` (ENH-09) -- absence is
 * silently rendered as empty string. Wrong-type values (key present but not a
 * string) still throw, since that's a misconfiguration rather than absence.
 */
function resolveInclude(payload: string, fullExpr: string, ctx: TemplateContext): string {
  let optional = false;
  if (payload.startsWith('optional:')) {
    optional = true;
    payload = payload.slice('optional:'.length);
  }
  if (!payload.startsWith('project.')) {
    throw new TemplateIncludeError(fullExpr, `only 'include:project.X.Y' (or 'include:optional:project.X.Y') is supported (got 'include:${optional ? 'optional:' : ''}${payload}')`);
  }
  const dotted = payload.slice('project.'.length);
  if (!ctx.manifest) {
    if (optional) return '';
    throw new TemplateIncludeError(fullExpr, 'no manifest loaded; cannot resolve include');
  }
  const path = lookupKey(ctx.manifest.project, dotted);
  if (path === undefined) {
    if (optional) return '';
    throw new TemplateIncludeError(fullExpr, `manifest key 'project.${dotted}' is undefined`);
  }
  if (typeof path !== 'string') {
    throw new TemplateIncludeError(fullExpr, `manifest key 'project.${dotted}' is not a string path`);
  }
  if (path === '') {
    if (optional) return '';
    throw new TemplateIncludeError(fullExpr, `manifest key 'project.${dotted}' is empty (intentionally undefined; skill must guard before referencing)`);
  }
  const abs = resolve(ctx.manifest.projectRoot, path);
  if (!existsSync(abs)) {
    if (optional) return '';
    throw new TemplateIncludeError(fullExpr, `file not found: ${abs}`);
  }
  return readFileSync(abs, 'utf-8');
}

/**
 * Try to parse output as JSON and extract a field.
 * Falls back to searching for KEY=VALUE or KEY: VALUE patterns in plain text.
 */
function extractJsonField(output: string, field: string): string {
  // Try JSON parse first
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === 'object' && field in parsed) {
      return String(parsed[field]);
    }
  } catch {
    // Not JSON -- try text pattern matching
  }

  // Search for "field: value" or "field=value" in output lines
  for (const line of output.split('\n')) {
    const colonMatch = line.match(new RegExp(`^\\s*${escapeRegex(field)}\\s*:\\s*(.+)`, 'i'));
    if (colonMatch) return colonMatch[1].trim();

    const equalsMatch = line.match(new RegExp(`^\\s*${escapeRegex(field)}\\s*=\\s*(.+)`, 'i'));
    if (equalsMatch) return equalsMatch[1].trim();
  }

  return '';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the initial TemplateContext for a workflow run.
 */
export function buildInitialContext(
  inputs: Record<string, string | number | boolean>,
  stateData: Record<string, string>,
  latticeRoot?: string,
  manifest?: Manifest,
): TemplateContext {
  const env: Record<string, string> = {
    TIMESTAMP: new Date().toISOString(),
  };
  if (latticeRoot) env['LATTICE_ROOT'] = latticeRoot;
  return {
    inputs,
    nodes: {},
    state: stateData,
    env,
    manifest,
  };
}
