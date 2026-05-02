#!/usr/bin/env python3
"""
audit-novel-source-discovery.py <review-file> [<review-file> ...]

Validates the Verify-Before-Citing Gate (peer-review skill, GAP-25.15) on
peer-review files. Mechanically enforces what the skill prompt declares:
"rows missing a `Verification` cell are a defect -> orchestrator MUST
re-launch the review."

Pass-through (exit 0):
  - File has no `Novel Source Discovery` section -> not a --novel review.
  - File has the section AND every row in the Verification-column table
    has a populated, non-template-placeholder Verification cell, AND no
    row contains NOT-FOUND in the main table.

Fail (exit 1) with diagnostic per offending row:
  - File has `Novel Source Discovery` section but no Verification-column table.
  - Any row has empty Verification cell.
  - Any row has the template placeholder text left as-is.
  - Any row contains NOT-FOUND in the main table (must move to
    `### Searched-but-Not-Found` per the skill spec).

Exit 2: usage / file-not-found.

Per GAP-25.15.1 (mechanical orchestrator enforcement). Called by
research-cycle.md Step 4 R2 gate check.
"""
import re
import sys
from pathlib import Path

TEMPLATE_PLACEHOLDER_FRAGMENTS = (
    "[VERIFIED via {method}",
    "{what matched}",
    "BLOCKED via {method}",
)

# Match a markdown header (## .. ###### levels) literally titled "Novel
# Source Discovery". Substring matching is too loose -- it would fire on
# prose like "no Novel Source Discovery section here".
NOVEL_HEADER_RE = re.compile(r"^#{2,6}\s+Novel Source Discovery", re.MULTILINE)

# Sentinel used when re-tokenizing rows that contain `\|` (escaped pipe
# inside a cell). Python's str.split is literal so it would otherwise
# break the cell at the escape.
ESCAPED_PIPE_SENTINEL = "\x00ESCAPED_PIPE\x00"


def audit_file(path: Path) -> list[str]:
    """Return list of defect strings; empty list = pass."""
    if not path.exists():
        return [f"file not found: {path}"]

    content = path.read_text(encoding="utf-8")

    # Pass-through if no Novel Source Discovery markdown header
    if not NOVEL_HEADER_RE.search(content):
        return []

    lines = content.splitlines()

    # Find the table header row: starts with `|`, contains both "Source" and "Verification"
    header_idx = None
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        if (
            stripped.startswith("|")
            and "Source" in line
            and "Verification" in line
            and not line.lstrip().startswith("|---")
        ):
            header_idx = i
            break

    if header_idx is None:
        return [
            "'Novel Source Discovery' section present but no table with a "
            "`Verification` column header was found"
        ]

    # Skip header + markdown separator row, then iterate data rows until
    # the table ends (blank line or non-pipe line).
    defects = []
    rows = 0
    for line in lines[header_idx + 2 :]:
        stripped = line.strip()
        if not stripped or not stripped.startswith("|"):
            break  # end of table
        rows += 1

        # Check template placeholder against the WHOLE row first -- the
        # placeholder text contains pipes (escaped or not) that confuse
        # cell-splitting downstream.
        if any(frag in line for frag in TEMPLATE_PLACEHOLDER_FRAGMENTS):
            defects.append(
                f"row {rows}: template placeholder text left in row -- fill "
                "in the actual VERIFIED/BLOCKED/NOT-FOUND outcome"
            )
            continue

        # Tokenize cells with `\|` treated as literal-pipe (escaped).
        safe = stripped.replace(r"\|", ESCAPED_PIPE_SENTINEL)
        cells = [c.strip().replace(ESCAPED_PIPE_SENTINEL, "|") for c in safe.split("|")]
        # Leading and trailing pipes produce empty first/last entries; the
        # last real cell (Verification) is cells[-2].
        if len(cells) < 3:
            continue
        verif = cells[-2]

        if not verif:
            defects.append(f"row {rows}: empty Verification cell")
            continue

        if "NOT-FOUND" in verif:
            defects.append(
                f"row {rows}: NOT-FOUND row left in main table -- move to a "
                "'### Searched-but-Not-Found' subsection so it cannot be "
                "mistaken for a citation (per GAP-25.15 hard rule 3)"
            )
            continue

    # Header exists but zero data rows: acceptable (reviewer may have found
    # no novel sources to cite). Do not flag.
    return defects


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "usage: audit-novel-source-discovery.py <review-file> "
            "[<review-file> ...]",
            file=sys.stderr,
        )
        return 2

    overall_fail = False
    for arg in sys.argv[1:]:
        path = Path(arg)
        defects = audit_file(path)
        if not defects:
            continue
        overall_fail = True
        print(f"FAIL: {path}", file=sys.stderr)
        for d in defects:
            print(f"  - {d}", file=sys.stderr)
        print("", file=sys.stderr)

    if overall_fail:
        print(
            "Per the Verify-Before-Citing Gate (GAP-25.15, "
            "commands/lattice/peer-review.md Section 5):",
            file=sys.stderr,
        )
        print(
            "  - Every row in the Novel Source Discovery table needs a "
            "populated Verification cell.",
            file=sys.stderr,
        )
        print(
            "  - Outcomes: VERIFIED via <method> / BLOCKED via <method>, "
            "logged + PROVISIONAL / NOT-FOUND -- removed.",
            file=sys.stderr,
        )
        print(
            "  - NOT-FOUND rows must be moved out of the main table into a "
            "'### Searched-but-Not-Found' subsection.",
            file=sys.stderr,
        )
        print(
            "  - Re-launch the peer-review agent and direct it to fill in "
            "verification per the skill spec.",
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
