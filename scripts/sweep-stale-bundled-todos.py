#!/usr/bin/env python3
"""Sweep stale TODO entries whose parent cycle is phase=complete.

Lattice-side framework script. Synced to consumer projects via sync-skills.sh,
where it runs against the project's own `.lattice/cycle-state/` and TODO file.

Two gap classes that `find-bundled-cycle.sh` misses for sweep purposes (the
dispatcher's dedup script skips its own state file by design — fine for
"don't re-cycle MY topic", wrong for "find every stale child"):

  (a) The cycle's own topic — when the cycle hits `phase: complete` but the
      TODO header still reads "blueprint-complete" / "research-draft" / etc.
      Exemplar: GAP-VEHICLE-5 (state phase=complete 2026-05-11 but TODO entry
      stale).

  (b) PROBE: SF-* entries listed under science_flags inside the same cycle,
      with status=resolved. Exemplar: PROBE: SF-VEH5-1 (resolved at
      blueprint.3 but TODO entry stale).

Bundled child IDs (`scope`, `known_gap_anchors`, `gaps_persisted.todo`,
`todo_verified.entries`, `bundled_bugs`) are also surfaced so a single sweep
covers the whole class. Those are reported as BUNDLED-CANDIDATE because
cycle state can legitimately list a child as "NOT BLOCKING" / "design-cycle
handoff" / "deferred-with-named-dependency" (= still open work spawned by
the cycle, not shipped by it).

Three verdict tiers:
  RESOLVED-SCIENCE-FLAG  PROBE: SF-* with status=resolved in the cycle's
                         science_flags block. Auto-applicable: the flag is
                         tied to a specific resolution event in the cycle,
                         not an ongoing concern.
  PARENT-CANDIDATE       Cycle topic itself, phase=complete. NOT auto-apply
                         safe: a topic can have successive cycles (NOAEL-ALG
                         is the exemplar), each shipping one iteration while
                         the TODO entry stays open for the next.
  BUNDLED-CANDIDATE      Child ID in cycle scope/persisted lists. NOT auto-
                         apply safe: cycle state can list a child as still-
                         open spawned work, not shipped work.

Modes:
  (default)          Print report. No edits.
  --apply-confident  Apply strikethrough to RESOLVED-SCIENCE-FLAG rows only.
                     PARENT-CANDIDATE / BUNDLED-CANDIDATE rows surface but
                     stay untouched. Idempotent.

The strikethrough edit is minimal: title becomes ~~...~~ with an appended
"RESOLVED (parent cycle `X` phase=complete)" marker. Resolution evidence
(commit hashes, build-cycle close timestamps) is added by hand; the sweep
does not invent evidence it cannot verify.

Path resolution (project-agnostic):
  1. Env var LATTICE_PROJECT_ROOT  (override; otherwise CWD).
  2. lattice-project.toml [project.backlog].todo  (canonical manifest entry).
  3. Fallback: docs/_internal/TODO.md  (lattice-default convention).
  4. Fallback: TODO.md  (repo-root convention).

Exit codes:
  0  No stale entries, or --apply-confident applied successfully.
  1  IO/config error (no cycle-state dir, no TODO file).
  2  Stale entries found in report mode.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# tomllib is stdlib since Python 3.11. The lattice harness requires 3.11+ for
# its executor; consumer projects do too because most projects depend on
# tomllib elsewhere in the toolchain. If tomllib is missing we silently fall
# back to the convention paths -- losing only the lattice-project.toml
# resolution step, not the whole sweep.
try:
    import tomllib  # type: ignore[unresolved-import]
    _TOMLLIB_OK = True
except ImportError:
    tomllib = None  # type: ignore[assignment]
    _TOMLLIB_OK = False


# ---------------------------------------------------------------------------
# Project path resolution
# ---------------------------------------------------------------------------

def resolve_project_root() -> Path:
    """Resolve the consumer-project root."""
    env = os.environ.get("LATTICE_PROJECT_ROOT")
    if env:
        return Path(env).resolve()
    return Path.cwd().resolve()


def resolve_todo_path(project_root: Path) -> Path | None:
    """Resolve the project's TODO.md per lattice-project.toml or convention."""
    # Env override beats everything.
    env = os.environ.get("LATTICE_TODO_PATH")
    if env:
        p = Path(env)
        if not p.is_absolute():
            p = project_root / p
        return p.resolve() if p.exists() else None

    # Manifest: [project.backlog].todo
    manifest = project_root / "lattice-project.toml"
    if manifest.exists() and _TOMLLIB_OK:
        try:
            with manifest.open("rb") as fh:
                cfg = tomllib.load(fh)
            todo_rel = cfg.get("project", {}).get("backlog", {}).get("todo")
            if todo_rel:
                p = project_root / todo_rel
                if p.exists():
                    return p.resolve()
        except (OSError, tomllib.TOMLDecodeError):
            # Fall through to convention paths.
            pass

    # Convention fallbacks.
    for rel in ("docs/_internal/TODO.md", "TODO.md"):
        p = project_root / rel
        if p.exists():
            return p.resolve()
    return None


# ---------------------------------------------------------------------------
# Cycle-state extraction (text-mode -- no PyYAML dep guarantee)
# ---------------------------------------------------------------------------

LIST_ITEM_RE = re.compile(r"^\s*-\s+(.+?)\s*(?:#.*)?$")
ID_FIELD_RE = re.compile(r"^id:\s+(.+)$")
# Bare ID token shape (any "looks like an ID" -- used at cycle-state extraction).
ID_TOKEN_RE = re.compile(r"^[A-Z][A-Z0-9\-]{2,}$")
COLON_PREFIX_RE = re.compile(r"^([A-Z][A-Z0-9\-]{2,}):\s")
QUOTED_RE = re.compile(r"""^(?P<q>['"])(?P<inner>.*)(?P=q)$""")

# A *legitimate* TODO-work-item ID has a hyphen AND a recognized prefix. This
# filter suppresses noise: cycle-state YAMLs carry scope corrections (`SC-1`),
# gap anchors (`G6`), pre-blueprint gates (`PG-VEH-5-1`), subsystem refs
# (`S14`), and probe verdicts (`PROPAGATES`/`BREAKS`/`SAFE`) under list
# items -- none of which name actual TODO entries.
#
# Projects can extend the allowlist via env: LATTICE_TODO_ID_PREFIXES="FOO-,BAR-"
# (comma-separated; merged with the defaults).
WORK_ITEM_ID_PREFIXES_DEFAULT = (
    "GAP-",          # GAP-NNN, GAP-XXX-N, GAP-XX-XXX-NN
    "DATA-GAP-",     # data-acquisition gaps
    "BUG-",          # BUG-SWEEP entries
    "BFIELD-",       # backend field contracts
    "NOAEL-",        # NOAEL-ALG cycle family (pcc-specific but harmless elsewhere)
    "AUDIT-",        # standing audits
    "CONS-",         # consolidation cycles
    "LATTICE-",      # framework prereqs
    "MANIFEST-",     # system-manifest bookkeeping
    "PROBE-",        # cross-impact probe persisted findings
    "RG-",           # research-registry streams
    "SF-",           # science flags (matched in PROBE: SF-X form)
    "DEEPDIVE-",
    "VBND-",         # vehicle classification boundary facts (pcc)
    "VEH-",          # vehicle-confound facts (pcc)
    "OSM-",          # osmolarity facts (pcc)
    "SD-",           # study-design issues (pcc)
)


def work_item_id_prefixes() -> tuple[str, ...]:
    extra = os.environ.get("LATTICE_TODO_ID_PREFIXES", "").strip()
    extras = tuple(p.strip() for p in extra.split(",") if p.strip()) if extra else ()
    return WORK_ITEM_ID_PREFIXES_DEFAULT + extras


def is_work_item_id(s: str, prefixes: tuple[str, ...]) -> bool:
    """True if s looks like a legitimate TODO work-item ID (vs cycle internals)."""
    if not ID_TOKEN_RE.match(s):
        return False
    return s.startswith(prefixes)


def _unquote(s: str) -> str:
    m = QUOTED_RE.match(s)
    return m.group("inner") if m else s


def extract_cycle_state(yaml_path: Path) -> dict:
    """Return cycle topic, phase, bundled IDs, resolved science-flag IDs."""
    text = yaml_path.read_text(encoding="utf-8", errors="replace")
    topic = None
    phase = None
    bundled: set[str] = set()
    resolved_sf: set[str] = set()

    # Mini state machine for science_flags blocks (track 'id:' + 'status: resolved'
    # within the same '- id:' item).
    sf_pending_id: str | None = None
    sf_pending_resolved = False
    in_sf_block = False

    for raw in text.splitlines():
        line = raw.rstrip()

        m_topic = re.match(r"^topic:\s+(.+)$", line)
        if m_topic and topic is None:
            topic = _unquote(m_topic.group(1).strip())
            continue

        m_phase = re.match(r"^phase:\s+(.+)$", line)
        if m_phase and phase is None:
            phase = _unquote(m_phase.group(1).strip())
            continue

        # Detect entry into a science_flags block (any nesting).
        if re.match(r"^\s*science_flags:\s*$", line):
            in_sf_block = True
            sf_pending_id = None
            sf_pending_resolved = False
            continue

        # End of science_flags block on dedent to top-level key.
        if in_sf_block and re.match(r"^[A-Za-z_]", line):
            if sf_pending_id and sf_pending_resolved:
                resolved_sf.add(sf_pending_id)
            in_sf_block = False
            sf_pending_id = None
            sf_pending_resolved = False
            # fall through -- line may be a new top-level field

        # Within an SF block, accumulate id + status:resolved per item.
        if in_sf_block:
            m_id = re.search(r"^\s*-\s*id:\s*(.+)$", line)
            if m_id:
                if sf_pending_id and sf_pending_resolved:
                    resolved_sf.add(sf_pending_id)
                sf_pending_id = _unquote(m_id.group(1).strip())
                sf_pending_resolved = False
                continue
            m_status = re.search(r"^\s*status:\s*(\w+)", line)
            if m_status and m_status.group(1).lower() == "resolved":
                sf_pending_resolved = True
                continue

        # Generic list-item: bare ID, "ID: description", or "id: ID" mapping form.
        m_item = LIST_ITEM_RE.match(line)
        if m_item:
            item = _unquote(m_item.group(1).strip())
            if ID_TOKEN_RE.match(item):
                bundled.add(item)
            else:
                m_colon = COLON_PREFIX_RE.match(item)
                if m_colon:
                    bundled.add(m_colon.group(1))
                else:
                    m_idfield = ID_FIELD_RE.match(item)
                    if m_idfield:
                        val = _unquote(m_idfield.group(1).strip())
                        if ID_TOKEN_RE.match(val):
                            bundled.add(val)

    # End-of-file flush for trailing SF item.
    if in_sf_block and sf_pending_id and sf_pending_resolved:
        resolved_sf.add(sf_pending_id)

    return {
        "topic": topic,
        "phase": phase,
        "bundled": bundled,
        "resolved_sf": resolved_sf,
        "path": yaml_path,
    }


# ---------------------------------------------------------------------------
# TODO.md header lookup
# ---------------------------------------------------------------------------

def find_todo_header(todo_lines: list[str], target_id: str, allow_probe_form: bool):
    """Locate the TODO header for target_id.

    allow_probe_form: only when the candidate is a science-flag ID (SF-*).
    Without this restriction, a non-SF candidate like S14 would coincidentally
    match `### PROBE: S14 Rule Engine BREAKS` (a separate, legitimate entry
    about subsystem S14), creating false positives.
    """
    esc = re.escape(target_id)
    pat_regular = re.compile(rf"^### (~~)?{esc}(?:[: ~]|$)")
    pat_probe = re.compile(rf"^### (~~)?PROBE: {esc}(?:[: ~]| )") if allow_probe_form else None
    for i, line in enumerate(todo_lines):
        if pat_regular.match(line) or (pat_probe and pat_probe.match(line)):
            head_segment = line.split("]", 1)[0] if "]" in line else line
            is_strike = "~~" in head_segment
            return i, line, is_strike
    return None


# ---------------------------------------------------------------------------
# Strikethrough edit (idempotent)
# ---------------------------------------------------------------------------

HEADER_TRANSFORM_RE = re.compile(
    r"^### (?P<prefix>PROBE:\s+)?(?P<id>[A-Z][A-Z0-9\-]{2,})(?P<tail>[^\[]*?)(?P<area>\s*\[Area:[^\]]*\])\s*$"
)


def transform_header(line: str, parent_topic: str):
    m = HEADER_TRANSFORM_RE.match(line.rstrip("\n"))
    if not m:
        return None
    prefix = m.group("prefix") or ""
    tid = m.group("id")
    tail = m.group("tail") or ""
    area = m.group("area")
    suffix = f" — RESOLVED (parent cycle `{parent_topic}` phase=complete)"
    return f"### ~~{prefix}{tid}{tail}~~{area}{suffix}\n"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

VERDICT_PARENT = "PARENT-CANDIDATE"
VERDICT_SF = "RESOLVED-SCIENCE-FLAG"
VERDICT_BUNDLED = "BUNDLED-CANDIDATE"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply-confident", action="store_true",
                    help="Apply strikethrough to RESOLVED-SCIENCE-FLAG rows. PARENT- and BUNDLED-CANDIDATE rows still require manual review.")
    ap.add_argument("--verbose", "-v", action="store_true", help="Print header text for each finding.")
    args = ap.parse_args()

    project_root = resolve_project_root()
    state_dir = project_root / ".lattice" / "cycle-state"
    todo_file = resolve_todo_path(project_root)

    if not state_dir.exists():
        print(f"ERROR: no cycle-state directory at {state_dir}", file=sys.stderr)
        return 1
    if todo_file is None or not todo_file.exists():
        print(f"ERROR: could not resolve TODO.md (checked LATTICE_TODO_PATH, lattice-project.toml [project.backlog].todo, docs/_internal/TODO.md, TODO.md)", file=sys.stderr)
        return 1

    prefixes = work_item_id_prefixes()
    todo_text = todo_file.read_text(encoding="utf-8")
    todo_lines = todo_text.splitlines(keepends=True)

    findings: list[dict] = []
    for yaml_path in sorted(state_dir.glob("*.yaml")):
        state = extract_cycle_state(yaml_path)
        if state["phase"] != "complete" or not state["topic"]:
            continue
        topic = state["topic"]

        candidates: list[tuple[str, str]] = [(topic, VERDICT_PARENT)]
        for sf in sorted(state["resolved_sf"]):
            candidates.append((sf, VERDICT_SF))
        for child in sorted(state["bundled"]):
            if child == topic:
                continue
            candidates.append((child, VERDICT_BUNDLED))

        for cand_id, verdict in candidates:
            if verdict == VERDICT_BUNDLED and not is_work_item_id(cand_id, prefixes):
                continue
            allow_probe = verdict == VERDICT_SF
            hit = find_todo_header(todo_lines, cand_id, allow_probe_form=allow_probe)
            if hit is None:
                continue
            line_idx, line_text, is_strike = hit
            if is_strike:
                continue
            findings.append({
                "id": cand_id,
                "verdict": verdict,
                "parent": topic,
                "state_path": yaml_path,
                "line_idx": line_idx,
                "header": line_text.rstrip("\n"),
            })

    if not findings:
        print("No stale TODO entries found. All phase=complete cycles have their topics + science-flags + bundled children closed.")
        return 0

    by_verdict = {VERDICT_PARENT: [], VERDICT_SF: [], VERDICT_BUNDLED: []}
    for f in findings:
        by_verdict[f["verdict"]].append(f)

    print(f"Found {len(findings)} stale TODO entries across {len({f['parent'] for f in findings})} complete cycle(s):\n")
    print(f"  todo:  {todo_file}")
    print(f"  state: {state_dir}\n")
    for verdict in (VERDICT_PARENT, VERDICT_SF, VERDICT_BUNDLED):
        rows = by_verdict[verdict]
        if not rows:
            continue
        print(f"== {verdict} ({len(rows)}) ==")
        for f in rows:
            print(f"  {f['id']:48s}  parent={f['parent']:32s}  TODO:{f['line_idx']+1}  state={f['state_path'].name}")
            if args.verbose:
                print(f"    HEADER: {f['header']}")
        print()

    if not args.apply_confident:
        print("Report only. Re-run with --apply-confident to flip RESOLVED-SCIENCE-FLAG rows.")
        print("PARENT-CANDIDATE rows always require manual review -- a topic can have successive cycles,")
        print("each shipping one iteration while the TODO entry stays open for the next.")
        print("BUNDLED-CANDIDATE rows always require manual review -- cycle state may list a child as")
        print("'NOT BLOCKING' / 'design-cycle handoff' / 'deferred-with-named-dependency' (still open work).")
        return 2 if findings else 0

    confident = [f for f in findings if f["verdict"] == VERDICT_SF]
    if not confident:
        print("No RESOLVED-SCIENCE-FLAG rows to apply. PARENT-CANDIDATE / BUNDLED-CANDIDATE rows skipped (manual review).")
        return 0

    applied = 0
    skipped = 0
    for f in confident:
        new = transform_header(todo_lines[f["line_idx"]], f["parent"])
        if new is None:
            print(f"WARN: could not transform header for {f['id']} (unexpected shape):\n      {f['header']}", file=sys.stderr)
            skipped += 1
            continue
        todo_lines[f["line_idx"]] = new
        applied += 1

    if applied:
        todo_file.write_text("".join(todo_lines), encoding="utf-8")
        print(f"Applied {applied} strikethrough edit(s) to {todo_file}.")
        print("Resolution evidence (commit hashes, build-cycle close timestamps) must still be added by hand.")
    if skipped:
        print(f"Skipped {skipped} row(s) with unexpected header shape -- see warnings above.")
    if by_verdict[VERDICT_PARENT]:
        print(f"\nPARENT-CANDIDATE rows ({len(by_verdict[VERDICT_PARENT])}) untouched. Review manually:")
        for f in by_verdict[VERDICT_PARENT]:
            print(f"  {f['id']:48s}  parent={f['parent']}")
    if by_verdict[VERDICT_BUNDLED]:
        print(f"\nBUNDLED-CANDIDATE rows ({len(by_verdict[VERDICT_BUNDLED])}) untouched. Review manually:")
        for f in by_verdict[VERDICT_BUNDLED]:
            print(f"  {f['id']:48s}  parent={f['parent']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
