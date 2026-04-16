/**
 * @lattice/executor — DAG workflow executor for Lattice development framework.
 *
 * Phase 1: CLI executor (local, terminal-based approvals)
 * Phase 2: Slack adapter (thread-based approvals, phone access)
 * Phase 3: Headless mode (Claude API, runs on VPS)
 */

export { loadWorkflow, resolveWorkflowPath, WorkflowLoadError } from './loader.js';
export { buildExecutionLayers, getUpstreamNodes } from './dag.js';
export { resolveTemplate, resolveTemplates, buildInitialContext } from './template.js';
export { executeNode, checkTriggerRule, CliAdapter } from './nodes.js';
export { executeWorkflow } from './engine.js';
export { loadPortfolioState, checkCoherence, isTopicSafe, formatReport } from './coherence.js';
export { reconcileStates, formatReconciliation } from './reconcile.js';
export { runAutopilot } from './autopilot.js';
export { tryAutoResolve } from './auto-resolve.js';
export {
  loadE2EConfig, getChangedFiles, classifyTestability,
  runBranchComparison, writeE2EResult, readE2EResult,
  formatE2EResult, formatClassification,
} from './e2e.js';
export type {
  E2EConfig, SuiteConfig, E2EResult, SuiteComparison,
  SuiteRunResult, TestabilityResult, Classification,
} from './e2e.js';
export type {
  Workflow, WorkflowNode, WorkflowRun, NodeResult,
  PlatformAdapter, ExecutionLayer, NodeType, TriggerRule,
  BashNode, SkillNode, GateNode, ApprovalNode, ParallelNode,
} from './types.js';
