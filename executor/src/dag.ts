/**
 * DAG topological sort and layer builder.
 * Kahn's algorithm: builds execution layers where nodes within a layer
 * have no mutual dependencies and can run in parallel.
 */

import type { Workflow, ExecutionLayer, ParallelNode, GateNode, ApprovalNode } from './types.js';

/**
 * Compute the set of nodes that must NOT appear in the layer schedule.
 *
 * Two categories of node are managed outside the layer-by-layer iteration:
 *
 *   1. **Children of a `parallel` group** — the group itself is layer-scheduled
 *      and dispatches its children directly via `executeParallelGroup`.
 *      Listing them at the top level WITHOUT the group's depends_on (which is
 *      the convention in every shipped cycle workflow) means Kahn would
 *      otherwise put them in Layer 0 and run them BEFORE their group's
 *      prerequisites. CRITICAL safety bug from the 2026-05-04 audit:
 *      blueprint-cycle Layer 0 ran `architect-gate` and `probe` skills
 *      before `synthesize` even fired.
 *
 *   2. **Parentless route-only targets** — nodes referenced only as a `route:`
 *      from a gate/approval, with no `depends_on` of their own. Without this
 *      filter, Kahn places them in Layer 0 and they execute UNCONDITIONALLY
 *      at workflow start. CRITICAL-1 from the audit: every cycle workflow's
 *      `release-lock` node was parentless and a route target; the topic lock
 *      taken by `acquire-lock` was destroyed microseconds later in the same
 *      Layer 0. The runtime dispatcher (engine.ts post-layer route fan-out)
 *      handles their actual execution when a route activates them.
 *
 * Nodes excluded from layers are still in `wf.nodes`; the engine dispatches
 * them via the parallel-group executor or the route-target dispatcher.
 */
export function getNodesExcludedFromLayers(wf: Workflow): Set<string> {
  const excluded = new Set<string>();

  // Category 1: parallel-group children.
  for (const node of Object.values(wf.nodes)) {
    if (node.type === 'parallel') {
      for (const childId of (node as ParallelNode).nodes ?? []) {
        excluded.add(childId);
      }
    }
  }

  // Category 2: parentless route-only targets.
  const routeTargets = new Set<string>();
  for (const node of Object.values(wf.nodes)) {
    if (node.type === 'gate') {
      for (const cond of (node as GateNode).evaluate ?? []) {
        if (cond.route) routeTargets.add(cond.route);
      }
    } else if (node.type === 'approval') {
      for (const opt of (node as ApprovalNode).options ?? []) {
        if (opt.route) routeTargets.add(opt.route);
      }
    }
  }
  for (const id of routeTargets) {
    const target = wf.nodes[id];
    if (target && (!target.depends_on || target.depends_on.length === 0)) {
      excluded.add(id);
    }
  }

  return excluded;
}

/**
 * Build topological execution layers from a workflow's dependency graph.
 *
 * Layer 0 = root nodes (no depends_on).
 * Layer N = nodes whose dependencies are all in layers 0..N-1.
 *
 * Gate/approval routing edges are NOT part of topological sort --
 * they're resolved at runtime by the executor. Only depends_on edges
 * determine execution order.
 *
 * Nodes returned by `getNodesExcludedFromLayers` are filtered out of the
 * schedule entirely; the engine dispatches them via parallel-group / routing
 * mechanisms outside the layer iteration. See that function's docstring for
 * the safety motivation.
 */
export function buildExecutionLayers(wf: Workflow): ExecutionLayer[] {
  const excluded = getNodesExcludedFromLayers(wf);
  const nodeIds = Object.keys(wf.nodes).filter(id => !excluded.has(id));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep -> nodes that depend on it

  // Initialize
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }

  // Build adjacency from depends_on. Edges to excluded nodes (parallel-group
  // children, route-only targets) are dropped because those nodes are not in
  // the layer schedule -- their dependents must be unblocked through other
  // means (the parent group completing, or the route activating).
  for (const id of nodeIds) {
    const node = wf.nodes[id];
    const deps = (node.depends_on ?? []).filter(d => !excluded.has(d));
    inDegree.set(id, deps.length);
    for (const dep of deps) {
      const list = dependents.get(dep);
      if (list) list.push(id);
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
