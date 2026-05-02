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

        # GAP-25.15.4: VERIFIED rows must have a corresponding literature note.
        if "VERIFIED" in verif:
            # Try the Verification cell first (canonical "VERIFIED via X -> Author Year ..." form),
            # then fall back to the Source cell + Year cell combo if no AY pattern in verif.
            ay_text = verif
            if not SOURCE_AY_RE.search(ay_text) and len(cells) >= 4:
                # cells[1] = Source, cells[2] = Year, cells[3] = Citations, ...
                ay_text = f"{cells[1]} {cells[2]}"
            note_check = check_literature_note(ay_text, path)
            if note_check:
                defects.append(f"row {rows}: {note_check}")
                continue

    # Header exists but zero data rows: acceptable (reviewer may have found
    # no novel sources to cite). Do not flag.
    return defects


# Author-Year extraction from a Source-cell text.
# Matches "Smith 2024", "Smith & Jones 2024", "Smith et al 2024", "Smith et al. 2024".
# First token must start with a capital letter; year is 4 digits in 19xx/20xx range.
SOURCE_AY_RE = re.compile(
    r"\b([A-Z][a-zA-Z]{1,})(?:\s*&\s*[A-Z][a-zA-Z]{1,})?(?:\s+et\s+al\.?)?\s+(19[5-9]\d|20[0-3]\d)\b"
)


def check_literature_note(source_text: str, review_path: Path) -> str | None:
    """For a VERIFIED row's Source cell, check that a matching literature note
    exists at docs/_internal/research/literature/<author-lc>-<year>-*.md.
    Returns None if found, defect string if not.

    Heuristic match: extract first author + year from the Source cell, then
    glob for `<author-lowercase>-<year>-*.md` in the literature dir.
    """
    m = SOURCE_AY_RE.search(source_text)
    if not m:
        # Couldn't extract author+year from the cell -- defer to the reviewer
        # rather than emit a false-positive defect. Common: cell uses a DOI
        # only without a parseable author-year prefix.
        return None
    author = m.group(1).lower()
    year = m.group(2)

    # Find the literature dir relative to the review's repo root. Walk up
    # from the review_path until we find a `docs/_internal/research/` dir.
    # Fallback: assume CWD-relative path.
    lit_dir = None
    for ancestor in [review_path.parent] + list(review_path.parents):
        candidate = ancestor / "literature"
        if candidate.is_dir():
            lit_dir = candidate
            break
    if lit_dir is None:
        # Fallback: try CWD-relative
        candidate = Path("docs/_internal/research/literature")
        if candidate.is_dir():
            lit_dir = candidate
    if lit_dir is None:
        return (
            f"VERIFIED source '{author.capitalize()} {year}' cannot be "
            f"checked against literature/ -- no docs/_internal/research/"
            f"literature directory found relative to {review_path}"
        )

    # Glob for matching note
    matches = list(lit_dir.glob(f"{author}-{year}-*.md"))
    if not matches:
        return (
            f"VERIFIED source '{author.capitalize()} {year}' has no "
            f"corresponding literature note at "
            f"{lit_dir}/{author}-{year}-*.md (per GAP-25.15.4: every "
            f"VERIFIED novel-source row must have a literature-note stub "
            f"as its durable verification artifact)"
        )
    return None


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
