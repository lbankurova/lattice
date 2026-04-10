/**
 * YAML workflow loader and validator.
 * Parses workflow files, validates node references, checks for cycles.
 */

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { Workflow, WorkflowNode, GateNode, ApprovalNode, ParallelNode } from './types.js';

export class WorkflowLoadError extends Error {
  constructor(message: string, public file?: string) {
    super(file ? `${file}: ${message}` : message);
    this.name = 'WorkflowLoadError';
  }
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

  return wf;
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
