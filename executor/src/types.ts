/**
 * Lattice Workflow DAG type definitions.
 * Maps 1:1 to the YAML schema defined in workflows/schema.md.
 */

// ── Workflow top-level ──────────────────────────────────────

export interface Workflow {
  name: string;
  version: number;
  description: string;
  inputs: Record<string, WorkflowInput>;
  state?: WorkflowState;
  lock?: WorkflowLock;
  nodes: Record<string, WorkflowNode>;
  edges?: WorkflowEdge[];
}

export interface WorkflowInput {
  type: 'string' | 'integer' | 'boolean' | 'path';
  required?: boolean;
  default?: string | number | boolean;
}

export interface WorkflowState {
  file: string;
  resume_from?: string;
  revision_check?: boolean;
  initial?: Record<string, string>;
  prerequisite?: Record<string, string>;
}

export interface WorkflowLock {
  type: 'topic' | 'commit';
  key: string;
  holder: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

// ── Node types ──────────────────────────────────────────────

export type NodeType = 'bash' | 'skill' | 'gate' | 'approval' | 'parallel';

export interface BaseNode {
  type: NodeType;
  depends_on?: string[];
  condition?: string;
  checkpoint?: NodeCheckpoint;
  retry?: NodeRetry;
  auto_decision?: Record<string, string>;
  gate_check?: Record<string, string>;
  log?: boolean;
}

export interface BashNode extends BaseNode {
  type: 'bash';
  command: string;
  timeout?: number;
  on_failure?: 'stop' | 'skip' | 'continue';
  capture?: 'stdout' | 'exit_code' | 'both';
}

export interface SkillNode extends BaseNode {
  type: 'skill';
  skill: string | null;
  context?: 'inherit' | 'fresh';
  agent_type?: string;
  inputs?: Record<string, string>;
  prompt_append?: string;
}

export interface GateNode extends BaseNode {
  type: 'gate';
  evaluate: GateCondition[];
  on_no_match?: 'stop' | 'skip';
}

export interface GateCondition {
  condition: string;
  route: string;
}

export interface ApprovalNode extends BaseNode {
  type: 'approval';
  prompt: string;
  options: ApprovalOption[];
  timeout?: number;
  default?: string;
}

export interface ApprovalOption {
  id: string;
  label: string;
  route?: string;
}

export interface ParallelNode extends BaseNode {
  type: 'parallel';
  nodes: string[];
  trigger_rule?: TriggerRule;
}

export type TriggerRule = 'all_success' | 'one_success' | 'all_done' | 'none_failed';

export type WorkflowNode = BashNode | SkillNode | GateNode | ApprovalNode | ParallelNode;

// ── Checkpoint ──────────────────────────────────────────────

export interface NodeCheckpoint {
  state_key: string;
  phase?: string;
  captures?: string[];
}

export interface NodeRetry {
  max_attempts?: number;
  on?: string[];
}

// ── Token usage & cost ──────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface NodeCost {
  usage: TokenUsage;
  costUSD: number;
  durationMs: number;
  model?: string;
}

// ── Execution state ─────────────────────────────────────────

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output: string;
  exitCode?: number;
  startedAt: string;
  completedAt: string;
  error?: string;
  /** For gate nodes: which route was taken */
  route?: string;
  /** For approval nodes: which option was selected */
  selectedOption?: string;
  /** Token usage and cost (skill nodes only) */
  cost?: NodeCost;
  /** True when this result was synthesised by a dry-run pass (no real execution).
   * Template references to a dry-run node's output throw — see template.ts. */
  dryRun?: boolean;
}

export interface WorkflowRun {
  workflowName: string;
  inputs: Record<string, string | number | boolean>;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  nodeResults: Record<string, NodeResult>;
  /** Active route — for gate/approval routing, tracks which path is live */
  activeRoutes: Set<string>;
  /** Aggregated cost across all nodes in this run */
  totalCost: WorkflowCost;
}

export interface WorkflowCost {
  totalUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Per-node cost breakdown (nodeId -> cost) */
  byNode: Record<string, NodeCost>;
}

// ── Budget ──────────────────────────────────────────────────

export interface BudgetConfig {
  /** Max USD per workflow run (by workflow name) */
  perWorkflow?: Record<string, number>;
  /** Max USD per topic (accumulated across all runs) */
  perTopic?: number;
  /** Max USD per individual node (by node ID) */
  perNode?: Record<string, number>;
  /** Fraction of budget at which to warn (0-1, default 0.8) */
  alertThreshold?: number;
  /** Context-rot monitoring (LIT-09). Per-call input-token utilization vs window. */
  context?: ContextConfig;
}

/**
 * Context-rot monitoring config. Tracks per-call input-token utilization vs
 * the model's context window — the rot signal is "this single call used N% of
 * its window", which the USD-cost path doesn't surface.
 */
export interface ContextConfig {
  /** Model context window size in tokens (e.g., 200000 for Sonnet, 1000000 for Opus 4.7). */
  windowSize: number;
  /** Utilization fraction at which to warn (0-1, default 0.6). */
  warnThreshold?: number;
  /** Utilization fraction at which to block (0-1, default 0.8). */
  blockThreshold?: number;
}

export type AlertLevel = 'info' | 'warn' | 'block';

export interface BudgetAlert {
  level: AlertLevel;
  /** 'context' alerts use tokenSpent/tokenLimit/utilization instead of spentUSD/limitUSD. */
  scope: 'node' | 'workflow' | 'topic' | 'context';
  label: string;
  /** USD-scope alerts only; undefined for context-scope. */
  spentUSD?: number;
  /** USD-scope alerts only; undefined for context-scope. */
  limitUSD?: number;
  /** Context-scope alerts only: input tokens used by the call. */
  tokensSpent?: number;
  /** Context-scope alerts only: model context-window size. */
  tokenLimit?: number;
  /** Context-scope alerts only: tokensSpent / tokenLimit. */
  utilization?: number;
  message: string;
}

/**
 * One row of context-rot telemetry, persisted as JSONL to
 * .lattice/context-telemetry.jsonl. One row per skill-node call.
 */
export interface ContextTelemetryEntry {
  ts: string;
  workflow: string;
  node: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  utilization: number;
  level: AlertLevel | 'ok';
}

// ── Adapter interface (CLI now, Slack/web later) ────────────

export interface PlatformAdapter {
  /** Display a message to the user */
  sendMessage(message: string): Promise<void>;
  /** Prompt the user for approval and return the selected option ID */
  promptApproval(prompt: string, options: ApprovalOption[]): Promise<string>;
  /** Get the platform type */
  getPlatformType(): string;
}

// ── Execution layers (output of topological sort) ───────────

export interface ExecutionLayer {
  /** Layer index (0 = roots, no dependencies) */
  index: number;
  /** Node IDs in this layer (can run in parallel) */
  nodeIds: string[];
}
