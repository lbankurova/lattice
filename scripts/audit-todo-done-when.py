#!/usr/bin/env python3
"""Audit backlog entries for done-when probe coverage + already-satisfied staleness.

Lattice-side framework script. Synced to consumer projects via sync-skills.sh,
where it runs against the project's own TODO file (resolved through
lattice-project.toml [project.backlog].todo).

WHY THIS EXISTS
---------------
`/lattice:prioritize` and `/lattice:autopilot` reason from a backlog entry's
*self-description*. When an entry claims work is "remaining" but the work has
actually shipped, they re-recommend already-done work (the
IMPL-GAP-SGE-B4-CONFOUNDER-APPLICATION miss, 2026-06-11: the predicates +
application + tests all landed in the same commit that *filed* the gap as
"remaining"). The existing sweep-stale-bundled-todos.py is correlation-based
(parent cycle phase=complete) and only sees structurally-registered children;
it never checks whether the asserted code/data actually exists. This audit is
satisfaction-based: it runs a probe and asks "is this gap already done?".

WHAT IT MEASURES (report mode -- this is the MEASUREMENT pass)
-------------------------------------------------------------
1. Coverage: how many entries are *artifact-asserting* (a concrete code symbol
   or generated-data file the gap promises to add) and therefore CANDIDATES for
   a machine-runnable `done-when:` probe -- vs non-probeable design/research/
   needs-user entries that a probe cannot adjudicate.

2. Pervasiveness: of the artifact-asserting entries that use ADDITIVE verbs
   (add / create / emit / introduce / wire / file / build), how many cite a
   backticked code symbol that ALREADY EXISTS in the working tree. For additive
   gaps, symbol-existence == done, so a passing existence-probe is a
   high-confidence "this open entry looks already-satisfied" signal. Modify-class
   entries (modify / extend / fix / change) are reported in a SEPARATE tier
   because for them symbol-existence is necessary-not-sufficient (the symbol
   pre-exists; the gap is a change to it).

HONESTY BOUNDARIES (do not over-read the output)
------------------------------------------------
- Auto-derived existence-probes are a MEASUREMENT heuristic, not the real guard.
  The real guard requires HUMAN-authored `done-when:` probes that encode the
  actual satisfaction condition. This script estimates the size of the problem
  and surfaces a reviewable list; it does not close entries.
- TIER-A (additive + symbol-exists) is the trustworthy "likely stale" set.
  TIER-B (modify + symbol-exists) needs human review -- expect false positives.
- An entry with an explicit `done-when:` field is probed DIRECTLY (its own
  command is run) and bypasses the heuristic entirely.

Path resolution, exit codes, and text-mode parsing mirror
sweep-stale-bundled-todos.py.

Exit codes:
  0  No likely-stale (TIER-A) entries found.
  1  IO/config error (no TODO file).
  2  TIER-A likely-stale entries found (report mode).
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    import tomllib  # type: ignore[unresolved-import]
    _TOMLLIB_OK = True
except ImportError:
    tomllib = None  # type: ignore[assignment]
    _TOMLLIB_OK = False


# ---------------------------------------------------------------------------
# Project path resolution (mirrors sweep-stale-bundled-todos.py)
# ---------------------------------------------------------------------------

def resolve_project_root() -> Path:
    env = os.environ.get("LATTICE_PROJECT_ROOT")
    if env:
        return Path(env).resolve()
    return Path.cwd().resolve()


def resolve_todo_path(project_root: Path) -> Path | None:
    env = os.environ.get("LATTICE_TODO_PATH")
    if env:
        p = Path(env)
        if not p.is_absolute():
            p = project_root / p
        return p.resolve() if p.exists() else None

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
            pass

    for rel in ("docs/_internal/TODO.md", "TODO.md"):
        p = project_root / rel
        if p.exists():
            return p.resolve()
    return None


# ---------------------------------------------------------------------------
# Entry parsing
# ---------------------------------------------------------------------------

HEADER_RE = re.compile(r"^###\s+(?P<id>[^:\s]+):?\s*(?P<title>.*?)\s*$")
FIELD_RE = re.compile(r"^-\s+\*\*(?P<key>[^:*]+):\*\*\s*(?P<val>.*)$")

# A done-when line authored by hand (the real guard, when present).
DONE_WHEN_RE = re.compile(r"^-\s+\*\*done-when:\*\*\s*`(?P<cmd>.+)`\s*$")

# Backticked code-symbol citations. Two shapes:
#   `path/to/file.ext:symbol`  (path:symbol -- highest signal)
#   `symbol`                   (bare identifier, >=4 chars, snake/camel)
PATH_SYMBOL_RE = re.compile(r"`([\w./-]+\.\w+):([A-Za-z_]\w+)`")
BARE_SYMBOL_RE = re.compile(r"`([a-z_][a-z0-9_]{4,})`")

# Verb classes (lowercased title + what-clause scan).
ADDITIVE_VERBS = (
    "add", "create", "emit", "introduce", "wire", "file", "build",
    "produce", "generate", "expose", "implement", "new ",
)
MODIFY_VERBS = ("modify", "extend", "fix", "change", "update", "refactor", "rework")

# Kinds / autopilot tags that are NOT mechanically probeable -- a code/data probe
# cannot adjudicate "is this design reframe done?".
NON_PROBEABLE_KINDS = (
    "design", "research", "knowledge", "literature", "spec value",
    "science decision", "population audit", "design-followup",
)
NON_PROBEABLE_AUTOPILOT = (
    "needs-user", "needs-design", "needs-research", "investigate",
    "waiting-user-action", "waiting-architecture-spec", "waiting-architect-pass",
)


class Entry:
    __slots__ = ("eid", "title", "fields", "body_lines")

    def __init__(self, eid: str, title: str) -> None:
        self.eid = eid
        self.title = title
        self.fields: dict[str, str] = {}
        self.body_lines: list[str] = []

    @property
    def kind(self) -> str:
        return self.fields.get("kind", "").strip().lower()

    @property
    def autopilot(self) -> str:
        return self.fields.get("autopilot", "").strip().lower()

    @property
    def done_when(self) -> str | None:
        for ln in self.body_lines:
            m = DONE_WHEN_RE.match(ln.strip())
            if m:
                return m.group("cmd")
        return None

    @property
    def body_text(self) -> str:
        return "\n".join(self.body_lines)


def parse_entries(todo_text: str) -> list[Entry]:
    entries: list[Entry] = []
    cur: Entry | None = None
    for raw in todo_text.splitlines():
        m = HEADER_RE.match(raw)
        if m:
            cur = Entry(m.group("id").strip(), m.group("title").strip())
            entries.append(cur)
            continue
        if cur is None:
            continue
        cur.body_lines.append(raw)
        fm = FIELD_RE.match(raw.strip())
        if fm:
            cur.fields.setdefault(fm.group("key").strip().lower(), fm.group("val").strip())
    return entries


# ---------------------------------------------------------------------------
# Classification + probing
# ---------------------------------------------------------------------------

CLOSED_AUTOPILOT = ("resolved", "done", "closed", "retracted", "completed")


def is_closed(e: Entry) -> bool:
    """Entry already marked closed/resolved (strikethrough title or closure tag).
    Excluded from the likely-stale tally -- we measure OPEN stragglers."""
    if e.title.startswith("~~") or e.eid.startswith("~~"):
        return True
    ap = e.autopilot
    return any(tag in ap for tag in CLOSED_AUTOPILOT)


def is_non_probeable(e: Entry) -> bool:
    if any(k in e.kind for k in NON_PROBEABLE_KINDS):
        return True
    if any(a == e.autopilot for a in NON_PROBEABLE_AUTOPILOT):
        return True
    return False


# Kinds that CONFIDENTLY assert a buildable artifact -> the filing-block REQUIRES
# a done-when probe. Deliberately precise (not "everything not-non-probeable"):
# the block must fire on exactly the confounder-class entry (kind: implementation
# gap citing subject_syndromes.py:symbol) and never nag a vague entry whose
# satisfaction condition we cannot fairly demand be encoded.
# Compound kinds only -- NOT a bare "data" substring, which would false-match
# "metadata audit" / "data quality" etc. (architect + requirement review,
# 2026-06-11). A bare `kind: data` entry still triggers via a cited path:symbol.
REQUIRES_PROBE_KINDS = (
    "implementation gap", "data gap", "data emission", "spec fix",
)

# Only entries in an ACTIVELY-BUILDABLE state are subject to the filing-block.
# Parked states (waiting-*, blocked, needs-user/design/research) and closed
# states are exempt -- they may cite code as evidence/cross-ref without that
# code being the artifact-to-build. This is what keeps a strict day-1 block fair.
ACTIVE_BUILD_AUTOPILOT = (
    "ready", "needs-build", "needs-cycle", "in-progress", "in-cycle",
)


def autopilot_state(e: Entry) -> str:
    """First token of the autopilot field (strips appended `_score: N_` etc.)."""
    return e.autopilot.split()[0] if e.autopilot else ""


def requires_probe(e: Entry) -> bool:
    """True iff a NEWLY-FILED entry must carry a done-when probe (filing-block).

    ALL must hold: (1) actively-buildable autopilot state; (2) not a non-probeable
    kind; (3) asserts a concrete artifact -- declared artifact-kind OR a cited
    `path:symbol` code reference. Bare-symbol-only entries do NOT trigger (too
    fuzzy to fairly demand a probe)."""
    if autopilot_state(e) not in ACTIVE_BUILD_AUTOPILOT:
        return False
    if is_non_probeable(e):
        return False
    if any(k in e.kind for k in REQUIRES_PROBE_KINDS):
        return True
    if PATH_SYMBOL_RE.search(e.body_text):
        return True
    return False


def verb_class(e: Entry) -> str:
    """additive | modify | unknown -- scanned over title + the 'what'/'fix' clause."""
    scan = " ".join([
        e.title.lower(),
        e.fields.get("what", "").lower(),
        e.fields.get("fix", "").lower(),
    ])
    add_hit = any(v in scan for v in ADDITIVE_VERBS)
    mod_hit = any(v in scan for v in MODIFY_VERBS)
    if add_hit and not mod_hit:
        return "additive"
    if mod_hit and not add_hit:
        return "modify"
    if add_hit and mod_hit:
        return "mixed"
    return "unknown"


def cited_symbols(e: Entry) -> list[tuple[str, str | None]]:
    """Return [(symbol, file_or_None)] cited in backticks in the entry body."""
    out: list[tuple[str, str | None]] = []
    seen: set[str] = set()
    for fpath, sym in PATH_SYMBOL_RE.findall(e.body_text):
        if sym not in seen:
            seen.add(sym)
            out.append((sym, fpath))
    for sym in BARE_SYMBOL_RE.findall(e.body_text):
        # A bare backticked token counts as a CODE symbol only if it is
        # code-distinctive: contains an underscore or a camelCase hump. Plain
        # English words (`syndromes`, `direction`, `confidence`, `rationale`)
        # are false-positive-prone -- they exist as SOME definition in the tree
        # without meaning the gap is done. path:symbol citations bypass this.
        if sym in seen:
            continue
        distinctive = ("_" in sym) or any(c.isupper() for c in sym)
        if not distinctive:
            continue
        seen.add(sym)
        out.append((sym, None))
    return out


# Source roots searched for a symbol DEFINITION. Heavy/irrelevant trees
# (node_modules, venv, generated, .git, caches) are never scanned -- they make
# the search slow AND false-positive (a symbol appearing in a vendored dep is
# not OUR definition). Projects can override via LATTICE_AUDIT_SRC_DIRS (comma).
SRC_DIRS_DEFAULT = ("backend", "frontend/src", "scripts")
SRC_EXCLUDE_DIRS = ("node_modules", "venv", ".venv", "__pycache__", "generated",
                    ".git", "dist", "build", ".pytest_cache")


def _src_dirs(project_root: Path) -> list[Path]:
    env = os.environ.get("LATTICE_AUDIT_SRC_DIRS", "").strip()
    rels = [d.strip() for d in env.split(",") if d.strip()] if env else list(SRC_DIRS_DEFAULT)
    return [project_root / r for r in rels if (project_root / r).exists()]


# Definition-shaped lines: capture the defined identifier after a keyword, or a
# top-level/assigned NAME. One pass over the source tree builds the whole index,
# turning per-symbol lookup into an O(1) set membership test.
_DEF_RE = re.compile(
    r"(?:def|class|function|const|let|var)\s+([A-Za-z_]\w+)"          # keyword def
    r"|^\s*([A-Za-z_]\w+)\s*[:=]"                                      # top-level NAME = / NAME:
    r"|export\s+(?:default\s+)?(?:const|function|class)\s+([A-Za-z_]\w+)"  # ts export
)


def build_defined_symbols(project_root: Path) -> set[str]:
    """One-pass index of every symbol DEFINED in the project source tree."""
    defined: set[str] = set()
    excl = set(SRC_EXCLUDE_DIRS)
    exts = {".py", ".ts", ".tsx", ".js", ".jsx", ".sh"}
    for base in _src_dirs(project_root):
        for path in base.rglob("*"):
            if path.is_dir():
                continue
            if any(part in excl for part in path.parts):
                continue
            if path.suffix not in exts:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for m in _DEF_RE.finditer(text):
                for g in m.groups():
                    if g:
                        defined.add(g)
    return defined


def _git_show(project_root: Path, ref_path: str) -> str | None:
    """Return file content at a git ref (e.g. ':docs/.../TODO.md' staged,
    'HEAD:docs/.../TODO.md'). None if the path does not exist at that ref."""
    try:
        res = subprocess.run(["git", "show", ref_path], cwd=str(project_root),
                             capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=20)
        return res.stdout if res.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def newly_added_entries(project_root: Path, todo_rel: str) -> list[Entry]:
    """Entries present in the STAGED TODO but absent at HEAD (by entry id)."""
    staged = _git_show(project_root, f":{todo_rel}")
    if staged is None:
        return []
    head = _git_show(project_root, f"HEAD:{todo_rel}")
    head_ids = {e.eid for e in parse_entries(head)} if head is not None else set()
    return [e for e in parse_entries(staged) if e.eid not in head_ids]


def staged_block(project_root: Path, todo_rel: str) -> int:
    """Filing-time gate. For each NEWLY-ADDED artifact-asserting entry:
      - missing done-when           -> BLOCK
      - done-when present + PASSES   -> BLOCK (filing already-satisfied work)
      - done-when present + FAILS    -> OK (gap is real)
    Returns 0 (ok) or 1 (block). Report-only entries never trigger.
    """
    added = newly_added_entries(project_root, todo_rel)
    violations: list[tuple[str, str]] = []  # (eid, reason)
    for e in added:
        if not requires_probe(e):
            continue
        dw = e.done_when
        if dw is None:
            violations.append((e.eid,
                "artifact-asserting entry has no `done-when:` probe "
                "(add `- **done-when:** `<read-only shell test exiting 0 iff already done>``)"))
            continue
        verdict = run_done_when(project_root, dw)
        if verdict is True:
            violations.append((e.eid,
                f"done-when probe PASSES at filing time -> the work is ALREADY DONE. "
                f"Do not file a satisfied gap. probe: `{dw}`"))
        elif verdict is None:
            violations.append((e.eid,
                f"done-when probe could not run (fix the command). probe: `{dw}`"))
    if not violations:
        print(f"--- done-when filing-block: OK ({len(added)} new entr"
              f"{'y' if len(added)==1 else 'ies'}, no violations) ---")
        return 0
    print("=" * 72)
    print("done-when filing-block: BLOCKED")
    print("=" * 72)
    for eid, reason in violations:
        print(f"  [{eid}]")
        print(f"     {reason}")
    print("-" * 72)
    print("Why: /lattice:prioritize + autopilot trust an entry's self-description.")
    print("A gap whose done-when ALREADY passes is shipped work filed as open ->")
    print("they will re-recommend it (the IMPL-GAP-SGE-B4-CONFOUNDER miss, 2026-06-11).")
    print("Escape hatch (use only with rationale): LATTICE_DONE_WHEN_SKIP=1")
    return 1


def run_done_when(project_root: Path, cmd: str) -> bool | None:
    """Run a hand-authored done-when probe. Returns True if satisfied (exit 0),
    False if not (nonzero), None if the probe could not run.

    Trust model: `shell=True` runs a command string authored by a project
    contributor in TODO.md (a grep/test/find idiom), NOT external input. Shell
    injection here is the same threat level as the pre-commit hook itself.
    """
    try:
        res = subprocess.run(
            cmd, shell=True, cwd=str(project_root),
            capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=30,
        )
        return res.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit-symbols", type=int, default=6,
                    help="max cited symbols probed per entry (default 6)")
    ap.add_argument("--show", choices=["tier-a", "tier-b", "all"], default="tier-a",
                    help="which likely-stale tier to list in detail")
    ap.add_argument("--staged-block", action="store_true",
                    help="pre-commit filing gate: block newly-added artifact-asserting "
                         "entries that lack a done-when probe or whose probe already passes")
    args = ap.parse_args(argv)

    # Windows console is cp1252; TODO titles carry section-signs / em-dashes.
    # Force UTF-8 with replacement so the report never crashes on print.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass

    root = resolve_project_root()
    todo = resolve_todo_path(root)
    if todo is None:
        print("ERROR: could not resolve TODO file", file=sys.stderr)
        return 1

    if args.staged_block:
        if os.environ.get("LATTICE_DONE_WHEN_SKIP", "").strip() in ("1", "true", "yes"):
            print("--- done-when filing-block: SKIPPED (LATTICE_DONE_WHEN_SKIP) ---")
            return 0
        try:
            todo_rel = todo.relative_to(root).as_posix()
        except ValueError:
            todo_rel = todo.name
        return staged_block(root, todo_rel)

    entries = parse_entries(todo.read_text(encoding="utf-8", errors="replace"))
    defined = build_defined_symbols(root)

    n_total = len(entries)
    closed = [e for e in entries if is_closed(e)]
    open_entries = [e for e in entries if not is_closed(e)]
    non_probeable: list[Entry] = []
    probeable: list[Entry] = []
    for e in open_entries:
        (non_probeable if is_non_probeable(e) else probeable).append(e)

    have_done_when = [e for e in entries if e.done_when]

    tier_a: list[tuple[Entry, list[str]]] = []   # additive + symbol-exists -> likely stale
    tier_b: list[tuple[Entry, list[str]]] = []   # modify/mixed/unknown + symbol-exists -> review
    authored_satisfied: list[Entry] = []          # explicit done-when that passes

    for e in probeable:
        # 1) explicit hand-authored probe wins.
        dw = e.done_when
        if dw:
            verdict = run_done_when(root, dw)
            if verdict is True:
                authored_satisfied.append(e)
            continue
        # 2) heuristic existence-probe over cited symbols.
        syms = cited_symbols(e)[: args.limit_symbols]
        if not syms:
            continue
        existing = [s for (s, _fh) in syms if s in defined]
        if not existing:
            continue
        vc = verb_class(e)
        if vc == "additive":
            tier_a.append((e, existing))
        else:
            tier_b.append((e, existing))

    # -------- report --------
    print("=" * 72)
    print("TODO done-when audit -- MEASUREMENT pass (report only)")
    print(f"TODO: {todo}")
    print("=" * 72)
    print(f"total entries:                 {n_total}")
    print(f"  already closed/resolved:     {len(closed)}")
    print(f"  open:                        {len(open_entries)}")
    print(f"    non-probeable (design/etc):{len(non_probeable)}")
    print(f"    artifact-asserting:        {len(probeable)}")
    print(f"  carry explicit done-when:    {len(have_done_when)}")
    print("-" * 72)
    print(f"AUTHORED done-when PASSES (already satisfied): {len(authored_satisfied)}")
    for e in authored_satisfied:
        print(f"    [done] {e.eid}")
    print("-" * 72)
    print(f"TIER-A likely-stale (additive verb + cited symbol exists): {len(tier_a)}")
    print(f"TIER-B needs-review (modify/unknown verb + symbol exists):  {len(tier_b)}")
    print("=" * 72)

    def _dump(rows: list[tuple[Entry, list[str]]]) -> None:
        for e, existing in rows:
            ap_tag = e.autopilot or "?"
            print(f"  - {e.eid}  [autopilot:{ap_tag}] [verb:{verb_class(e)}]")
            print(f"      title: {e.title[:90]}")
            print(f"      existing symbols: {', '.join(existing[:6])}")

    if args.show in ("tier-a", "all"):
        print("\nTIER-A (review these first -- look already-done):")
        _dump(tier_a)
    if args.show in ("tier-b", "all"):
        print("\nTIER-B (symbol pre-exists; verb is modify -- needs human read):")
        _dump(tier_b)

    return 2 if tier_a else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
