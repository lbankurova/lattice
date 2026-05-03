/**
 * Template engine for variable substitution in workflow nodes.
 *
 * Resolves {{inputs.topic}}, {{nodes.X.output}}, {{nodes.X.output.field}},
 * {{state.phase}}, {{env.TIMESTAMP}} patterns.
 */

import type { NodeResult } from './types.js';

export interface TemplateContext {
  inputs: Record<string, string | number | boolean>;
  nodes: Record<string, NodeResult>;
  state: Record<string, string>;
  env: Record<string, string>;
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
 */
function resolveExpression(expr: string, ctx: TemplateContext): string | undefined {
  const parts = expr.split('.');

  if (parts.length < 2) return undefined;

  const root = parts[0];

  switch (root) {
    case 'inputs':
      return String(ctx.inputs[parts[1]] ?? '');

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
  };
}
