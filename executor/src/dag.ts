/**
 * DAG topological sort and layer builder.
 * Kahn's algorithm: builds execution layers where nodes within a layer
 * have no mutual dependencies and can run in parallel.
 */

import type { Workflow, ExecutionLayer } from './types.js';

/**
 * Build topological execution layers from a workflow's dependency graph.
 *
 * Layer 0 = root nodes (no depends_on).
 * Layer N = nodes whose dependencies are all in layers 0..N-1.
 *
 * Gate/approval routing edges are NOT part of topological sort --
 * they're resolved at runtime by the executor. Only depends_on edges
 * determine execution order.
 */
export function buildExecutionLayers(wf: Workflow): ExecutionLayer[] {
  const nodeIds = Object.keys(wf.nodes);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep -> nodes that depend on it

  // Initialize
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }

  // Build adjacency from depends_on
  for (const [id, node] of Object.entries(wf.nodes)) {
    const deps = node.depends_on ?? [];
    inDegree.set(id, deps.length);
    for (const dep of deps) {
      dependents.get(dep)!.push(id);
    }
  }

  // Kahn's algorithm — layer by layer
  const layers: ExecutionLayer[] = [];
  const placed = new Set<string>();

  // Find initial ready set (in-degree 0)
  let ready = nodeIds.filter(id => inDegree.get(id) === 0);

  while (ready.length > 0) {
    const layer: ExecutionLayer = {
      index: layers.length,
      nodeIds: [...ready],
    };
    layers.push(layer);

    // For each node in this layer, decrement dependents' in-degree
    const nextReady: string[] = [];
    for (const id of ready) {
      placed.add(id);
      for (const dependent of dependents.get(id)!) {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          nextReady.push(dependent);
        }
      }
    }

    ready = nextReady;
  }

  // Cycle check (should never fire -- loader.ts already checks)
  if (placed.size < nodeIds.length) {
    const remaining = nodeIds.filter(id => !placed.has(id));
    throw new Error(
      `Cycle detected in DAG: nodes not reachable: ${remaining.join(', ')}`
    );
  }

  return layers;
}

/**
 * Get the set of all nodes reachable from a given node via depends_on edges (upstream).
 * Used for determining what a node can reference in templates.
 */
export function getUpstreamNodes(nodeId: string, wf: Workflow): Set<string> {
  const upstream = new Set<string>();
  const queue = [...(wf.nodes[nodeId]?.depends_on ?? [])];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (upstream.has(current)) continue;
    upstream.add(current);
    queue.push(...(wf.nodes[current]?.depends_on ?? []));
  }

  return upstream;
}
