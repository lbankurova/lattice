/**
 * YAML workflow loader and validator.
 * Parses workflow files, validates node references, checks for cycles.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';
import type { Workflow, WorkflowNode, GateNode, ApprovalNode, ParallelNode } from './types.js';

export class WorkflowLoadError extends Error {
  constructor(message: string, public file?: string) {
    super(file ? `${file}: ${message}` : message);
    this.name = 'WorkflowLoadError';
  }
}

// ── Verdict enum registry (A2) ──────────────────────────────────────────

interface VerdictEnumRegistry {
  enums: Record<string, { members: string[]; description?: string }>;
  aliases: Record<string, string>;
}

let cachedRegistry: VerdictEnumRegistry | null = null;
let cachedRegistryFile: string | null = null;

/**
 * Load the verdict enum registry from `workflows/verdict-enums.yaml`. Returns
 * `null` if the file is absent (back-compat: existing consumer projects without
 * the registry yaml continue to validate without verdict-enum checks).
 */
export function loadVerdictRegistry(workflowFile: string): VerdictEnumRegistry | null {
  // Resolve registry file: same directory as the workflow file.
  const dir = dirname(resolve(workflowFile));
  const registryPath = `${dir}/verdict-enums.yaml`;

  if (cachedRegistryFile === registryPath && cachedRegistry) {
    return cachedRegistry;
  }

  if (!existsSync(registryPath)) {
    return null;
  }

  const raw = readFileSync(registryPath, 'utf-8');
  const doc = yaml.load(raw) as { enums?: Record<string, { members: string[] }>; aliases?: Record<string, string> } | null;

  if (!doc?.enums) {
    throw new WorkflowLoadError('verdict-enums.yaml missing top-level "enums" key', registryPath);
  }

  const registry: VerdictEnumRegistry = {
    enums: doc.enums,
    aliases: doc.aliases ?? {},
  };

  cachedRegistry = registry;
  cachedRegistryFile = registryPath;
  return registry;
}

/** Test-only: clear the cached registry between tests. */
export function _resetVerdictRegistryCache(): void {
  cachedRegistry = null;
  cachedRegistryFile = null;
}

/** Resolve a verdict-enum name through aliases. */
function resolveEnumName(name: string, registry: VerdictEnumRegistry): string {
  const visited = new Set<string>();
  let current = name;
  while (registry.aliases[current] && !visited.has(current)) {
    visited.add(current);
    current = registry.aliases[current];
  }
  return current;
}

/** Substring prefixes the loader recognizes when checking `.contains('PREFIX=VALUE')`. */
const KNOWN_VERDICT_PREFIXES = [
  'SECOND_GATE_VERDICT=',
  'MEMO_VERDICT=',
  'ARBITER_VERDICT=',
  'OPS_CHECK_VERDICT: ',
  'OPS_CHECK_VERDICT:',
];

interface VerdictReference {
  nodeId: string;
  literal: string;
  /** True when the literal came from a `.contains('PREFIX=VALUE')` form. */
  fromContains: boolean;
}

/**
 * Extract every `{{nodes.X.output.verdict}} == 'LITERAL'` and
 * `{{nodes.X.output}}.contains('PREFIX=LITERAL')` reference from a condition
 * expression. Returns the producing node id and the tested literal.
 */
function extractVerdictReferences(expr: string): VerdictReference[] {
  const refs: VerdictReference[] = [];

  // Equality / inequality form: {{nodes.<id>.output.verdict}} <op> '<X>'
  const eqRe = /\{\{nodes\.([a-zA-Z0-9_-]+)\.output\.verdict\}\}\s*(?:==|!=)\s*'([^']+)'/g;
  for (let m: RegExpExecArray | null; (m = eqRe.exec(expr)); ) {
    refs.push({ nodeId: m[1], literal: m[2], fromContains: false });
  }

  // Contains form: {{nodes.<id>.output}}.contains('<prefix>=<X>')
  const containsRe = /\{\{nodes\.([a-zA-Z0-9_-]+)\.output\}\}\.contains\(\s*'([^']+)'\s*\)/g;
  for (let m: RegExpExecArray | null; (m = containsRe.exec(expr)); ) {
    const inside = m[2];
    for (const prefix of KNOWN_VERDICT_PREFIXES) {
      if (inside.startsWith(prefix)) {
        refs.push({ nodeId: m[1], literal: inside.slice(prefix.length), fromContains: true });
        break;
      }
    }
  }

  return refs;
}

/**
 * Load and validate a workflow YAML file.
 */
export function loadWorkflow(filePath: string): Workflow {
  const raw = readFileSync(filePath, 'utf-8');
  const doc = yaml.load(raw) as { workflow: Workflow } | null;

  if (!doc?.workflow) {
    throw new WorkflowLoadError('Missing top-level "workflow" key', filePath);
  }

  const wf = doc.workflow;

  // Required fields
  if (!wf.name) throw new WorkflowLoadError('Missing workflow.name', filePath);
  if (!wf.version) throw new WorkflowLoadError('Missing workflow.version', filePath);
  if (!wf.nodes || Object.keys(wf.nodes).length === 0) {
    throw new WorkflowLoadError('Workflow has no nodes', filePath);
  }

  // Default inputs to empty
  wf.inputs = wf.inputs ?? {};

  // Validate all node references
  validateReferences(wf, filePath);

  // Check for cycles
  detectCycles(wf, filePath);

  // A2: verdict-enum validation. No-op when registry is absent (consumer
  // projects without verdict-enums.yaml).
  const registry = loadVerdictRegistry(filePath);
  if (registry) {
    validateVerdictReferences(wf, filePath, registry);
  }

  return wf;
}

/**
 * A2: Validate that every `{{nodes.X.output.verdict}} == 'LITERAL'` (and the
 * substring-form variants) references a literal in the producing node's
 * declared `verdict_enum`. Nodes without `verdict_enum` are skipped (opt-in
 * semantics — pre-existing workflows continue to validate).
 */
function validateVerdictReferences(wf: Workflow, file: string, registry: VerdictEnumRegistry): void {
  const errors: string[] = [];

  for (const [nodeId, node] of Object.entries(wf.nodes)) {
    if (node.type !== 'gate') continue;
    const conds = (node as GateNode).evaluate ?? [];

    for (const cond of conds) {
      if (!cond.condition || cond.condition === 'default') continue;
      const refs = extractVerdictReferences(cond.condition);

      for (const ref of refs) {
        const producing = wf.nodes[ref.nodeId];
        if (!producing) continue; // already caught by validateReferences

        const enumName = producing.verdict_enum;
        if (!enumName) continue; // opt-in: skip when producer doesn't declare

        const canonical = resolveEnumName(enumName, registry);
        const enumDef = registry.enums[canonical];
        if (!enumDef) {
          errors.push(
            `${nodeId}.evaluate references node "${ref.nodeId}" with verdict_enum "${enumName}" ` +
            `but no such enum is defined in verdict-enums.yaml. ` +
            `Known enums: ${Object.keys(registry.enums).join(', ')}.`
          );
          continue;
        }

        if (!enumDef.members.includes(ref.literal)) {
          errors.push(
            `${nodeId}.evaluate tests "${ref.literal}" against node "${ref.nodeId}" ` +
            `(verdict_enum: ${enumName}), but "${ref.literal}" is not a member. ` +
            `Allowed: ${enumDef.members.map(m => `'${m}'`).join(', ')}.`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new WorkflowLoadError(
      `Verdict-enum violations:\n  ${errors.join('\n  ')}`,
      file
    );
  }
}

/**
 * Validate that all depends_on, route, and parallel references point to existing nodes.
 */
function validateReferences(wf: Workflow, file: string): void {
  const nodeIds = new Set(Object.keys(wf.nodes));
  const errors: string[] = [];

  for (const [id, node] of Object.entries(wf.nodes)) {
    // depends_on
    for (const dep of node.depends_on ?? []) {
      if (!nodeIds.has(dep)) {
        errors.push(`${id}.depends_on references "${dep}" (not found)`);
      }
    }

    // gate routes
    if (node.type === 'gate') {
      for (const cond of (node as GateNode).evaluate ?? []) {
        if (cond.route && !nodeIds.has(cond.route)) {
          errors.push(`${id}.evaluate.route references "${cond.route}" (not found)`);
        }
      }
    }

    // approval routes
    if (node.type === 'approval') {
      for (const opt of (node as ApprovalNode).options ?? []) {
        if (opt.route && !nodeIds.has(opt.route)) {
          errors.push(`${id}.options.route references "${opt.route}" (not found)`);
        }
      }
    }

    // parallel node references
    if (node.type === 'parallel') {
      for (const ref of (node as ParallelNode).nodes ?? []) {
        if (!nodeIds.has(ref)) {
          errors.push(`${id}.parallel.nodes references "${ref}" (not found)`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new WorkflowLoadError(
      `Broken references:\n  ${errors.join('\n  ')}`,
      file
    );
  }
}

/**
 * Detect cycles using DFS. Throws if a cycle is found.
 */
function detectCycles(wf: Workflow, file: string): void {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();

  for (const id of Object.keys(wf.nodes)) {
    color.set(id, WHITE);
  }

  function dfs(nodeId: string, path: string[]): void {
    color.set(nodeId, GRAY);
    const node = wf.nodes[nodeId];
    const deps = node.depends_on ?? [];

    for (const dep of deps) {
      if (color.get(dep) === GRAY) {
        throw new WorkflowLoadError(
          `Cycle detected: ${[...path, nodeId, dep].join(' -> ')}`,
          file
        );
      }
      if (color.get(dep) === WHITE) {
        dfs(dep, [...path, nodeId]);
      }
    }

    color.set(nodeId, BLACK);
  }

  for (const id of Object.keys(wf.nodes)) {
    if (color.get(id) === WHITE) {
      dfs(id, []);
    }
  }
}

/**
 * Resolve the workflow file path from a workflow name.
 * Searches in the workflows/ directory relative to the lattice root.
 */
export function resolveWorkflowPath(name: string, latticeRoot: string): string {
  const candidates = [
    `${latticeRoot}/workflows/${name}.yaml`,
    `${latticeRoot}/workflows/${name}.yml`,
  ];

  for (const path of candidates) {
    try {
      readFileSync(path);
      return path;
    } catch {
      // try next
    }
  }

  throw new WorkflowLoadError(`Workflow "${name}" not found in ${latticeRoot}/workflows/`);
}
