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
