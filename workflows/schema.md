# Lattice Workflow DAG Schema

Version: 1.0

## Overview

Lattice workflows are YAML-defined directed acyclic graphs (DAGs) that encode the orchestration structure of development cycles. The AI fills in the intelligence at each node, but the graph structure, dependency edges, gates, and routing logic are deterministic and owned by the user.

**Relationship to skills:** YAML DAGs define *what runs when*. Markdown skills (`commands/lattice/*.md`) define *what each node does*. The DAG references skills by name; the executor reads the DAG, resolves dependencies, and dispatches each node using the skill's prompt.

**Execution model:** A DAG executor (Claude Code session, future phone/Slack adapter, or external runner) reads the workflow YAML, resolves the topological order, and runs nodes layer by layer. Within a layer, independent nodes run in parallel.

## Workflow Structure

```yaml
workflow:
  name: string           # Unique identifier (matches skill name)
  version: integer       # Schema version (currently 1)
  description: string    # One-line description

  inputs:                # Variables passed into the workflow
    <name>:
      type: string | integer | boolean | path
      required: boolean
      default: <value>   # Optional default

  state:                 # Integration with .lattice/cycle-state/
    file: string         # Path template: ".lattice/cycle-state/{{inputs.topic}}.yaml"
    resume_from: string  # State field to read for resume (e.g., "current_step")
    revision_check: true # Enable revision-checked writes (default: true)

  lock:                  # Topic or commit lock
    type: topic | commit
    key: string          # Template: "{{inputs.topic}}"
    holder: string       # Lock holder name (e.g., "research-cycle")

  nodes:
    <node-id>:           # Unique node identifier
      ...                # See Node Types below

  edges:                 # Optional explicit edges (alternative to depends_on)
    - from: <node-id>
      to: <node-id>
      condition: string  # Optional condition expression
```

## Node Types

### `bash` -- Shell command

```yaml
<node-id>:
  type: bash
  command: string              # Shell command (supports {{}} templates)
  timeout: integer             # Milliseconds (default: 120000)
  on_failure: stop | skip | continue
  capture: stdout | exit_code | both  # What to expose as output (default: both)
```

### `skill` -- AI agent running a skill prompt

```yaml
<node-id>:
  type: skill
  skill: string                # Skill reference: "lattice/research", "ops/check"
  context: inherit | fresh     # inherit = current session, fresh = separate agent
  agent_type: string           # Optional: agent definition from agents/ (e.g., "architect-reviewer")
  inputs:                      # Data passed to the skill
    <key>: string              # Supports {{}} templates
  prompt_append: string        # Optional text appended to skill prompt
```

### `gate` -- Conditional routing

```yaml
<node-id>:
  type: gate
  evaluate:                    # Conditions to check
    - condition: string        # Expression: "{{nodes.<id>.output.verdict}} == 'PASS'"
      route: <node-id>        # Where to go if true
    - condition: default       # Fallback route
      route: <node-id>
  on_no_match: stop | skip     # What to do if no condition matches
```

### `approval` -- Human decision point

```yaml
<node-id>:
  type: approval
  prompt: string               # Question presented to the user
  options:                     # Named choices
    - id: string
      label: string
      route: <node-id>        # Optional: route to specific node
  timeout: integer             # Optional: auto-approve after N seconds
  default: string              # Option ID to use on timeout
```

### `parallel` -- Concurrent node group

```yaml
<node-id>:
  type: parallel
  nodes: [<node-id>, ...]     # Nodes to run concurrently
  trigger_rule: all_success | one_success | all_done | none_failed
  # all_success: proceed when ALL nodes succeed (default)
  # one_success: proceed as soon as ONE succeeds
  # all_done:    proceed when all complete (regardless of success/failure)
  # none_failed: proceed when all complete and none failed
```

## Common Node Properties

These properties are available on all node types:

```yaml
<node-id>:
  depends_on: [<node-id>, ...]   # Nodes that must complete before this one starts
  condition: string               # Expression that must be true for this node to run
  checkpoint:                     # State to write after completion
    state_key: string             # e.g., "research.2"
    phase: string                 # Optional phase update (e.g., "research-complete")
    captures: [string, ...]       # Fields to save: key_decisions, constraints, output
  retry:
    max_attempts: integer         # Default: 1 (no retry)
    on: [transient]               # Error types to retry
  auto_decision:                  # Autonomous handling rules
    <verdict>: proceed | stop | accept | incorporate | route_to(<node-id>)
  gate_check:                     # Quality gate after node completes
    <check-name>: <expression>    # e.g., min_findings: "count(output.findings) >= 1"
    on_fail: retry | stop | route_to(<node-id>)
  log: boolean                    # Log to decisions.log (default: true for skills)
```

## Template Expressions

Templates use `{{}}` syntax with dot-notation access:

| Expression | Resolves to |
|---|---|
| `{{inputs.topic}}` | Workflow input variable |
| `{{nodes.<id>.output}}` | Full output of a completed node |
| `{{nodes.<id>.output.verdict}}` | Specific field from node output |
| `{{nodes.<id>.exit_code}}` | Bash node exit code |
| `{{state.current_step}}` | Current value from state file |
| `{{state.phase}}` | Current phase from state file |
| `{{env.TIMESTAMP}}` | ISO timestamp at execution time |

## Condition Expressions

Conditions support:
- Equality: `== 'value'`, `!= 'value'`
- Numeric: `> 0`, `<= 5`
- Boolean: `&& ||`
- Contains: `contains('text')`
- Existence: `exists`, `!exists`

## Execution Rules

1. **Topological ordering.** Nodes are sorted into layers using dependency edges. Layer 0 has no dependencies. Layer N depends only on layers 0..N-1.

2. **Parallel within layers.** Independent nodes in the same layer run concurrently. Use `parallel` nodes for explicit concurrent groups with trigger rules.

3. **Resume from state.** On workflow start, read `state.resume_from`. Skip nodes whose `checkpoint.state_key` is already recorded as completed. Resume from the first incomplete node.

4. **Lock lifecycle.** Lock acquired before first node, released after last node (or on failure). Lock heartbeat after every checkpoint write.

5. **Revision-checked writes.** Every state file mutation reads current revision, does work, re-reads before writing, increments. Mismatch = abort.

6. **Decision logging.** Every skill node logs to `.lattice/decisions.log` on completion: `{timestamp}\t{workflow}\t{verdict}\t{topic}\t{step}\t{summary}`.

7. **Failure propagation.** A failed node blocks all downstream dependents. `on_failure: skip` allows downstream nodes with `depends_on` the failed node to evaluate their own conditions.

8. **WIP checkpoint commits.** When uncommitted file count exceeds 15 during a workflow run, the engine creates a `wip: {topic} checkpoint {step}` commit with `--no-verify` (skips hooks). These get squashed in the final review commit.

## Cycle-State Lifecycle

Each `.lattice/cycle-state/{topic}.yaml` file can include a `lifecycle_state` field:

| State | Meaning | Autopilot behavior |
|---|---|---|
| `active` (default) | Topic is in normal operation | Eligible for advancement |
| `paused` | Intentionally on hold | Skipped, listed in summary |
| `archived` | Removed from portfolio | Not loaded at all |

Set `lifecycle_state: paused` with an optional `pause_reason: "..."` to hold a topic without archiving it. The coherence engine detects **zombie topics** (active phase, no lock, no checkpoint in 48h) and flags them as warnings for human decision.

## Multi-Platform Execution

The YAML DAG is the API contract between execution environments:

| Platform | Executor | Approval UX |
|---|---|---|
| Claude Code CLI | Current session + Agent tool | Inline prompt |
| Phone (future) | Remote agent API | Push notification |
| Slack (future) | Slack adapter | Thread reply |
| Web (future) | Server-side executor | Modal dialog |
| CI/CD (future) | Headless executor | Auto-approve or fail |

The workflow YAML is identical across platforms. Only the approval UX and output rendering differ.
