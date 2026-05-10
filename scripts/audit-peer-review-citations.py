#!/usr/bin/env python3
"""
audit-peer-review-citations.py [<peer-reviews-dir>]

Retroactive citation extraction for archived peer-review files (GAP-25.15.2).
Extracts three citation classes (DOI / PMID / Author-Year) from every .md file
under the given directory, classifies each file as `--novel` (has Novel Source
Discovery header, post-gate; gate already enforces forward-looking) vs standard
mode, and emits a structured report to stdout (and to
`.lattice/peer-review-citation-audit.txt` if writable).

Default scan root: `docs/_internal/research/peer-reviews/` from CWD.

Output format (per line in the per-file section):
  L<line>  <CLASS>  <citation-text>
where CLASS in {DOI, PMID, AY}.

This is extraction-only -- no network verification. Manual or follow-up tooling
verifies DOIs/PMIDs against the doi.org / PubMed endpoints. Author-Year-only
(AY) citations cannot be verified mechanically; a high AY-to-DOI ratio in a
file is itself a warning flag (the failure mode of the original 2026-05-01
sweep was author-year-only citations that resolved to nothing on lookup).

Per pcc TODO.md GAP-25.15.2.
"""
import re
import sys
from pathlib import Path

# DOI: 10.<registrant>/<suffix> -- suffix may contain alphanumerics, dot, dash,
# underscore, slash, colon. Conservative trailing punctuation strip.
DOI_RE = re.compile(r"\b10\.\d{4,9}/[\w\.\-/_:;()]+", re.IGNORECASE)

# PMID: explicit "PMID 12345" / "PMID: 12345" / pubmed.ncbi URL with id
PMID_RE = re.compile(
    r"(?:PMID[\s:]+(\d{4,9})|pubmed\.ncbi\.nlm\.nih\.gov/(\d{4,9}))",
    re.IGNORECASE,
)

# Author-Year: <Lastname> [& <Lastname>] [et al] <4-digit-year>
# Heuristic: capitalized last name followed (optionally by "& Lastname" and/or
# "et al") then a 4-digit year in 19xx/20xx range.
AY_RE = re.compile(
    r"\b([A-Z][a-zA-Z]{2,}(?:\s*&\s*[A-Z][a-zA-Z]{2,})?(?:\s+et\s+al\.?)?)\s+(19[6-9]\d|20[0-3]\d)\b"
)

# Markdown header for Novel Source Discovery section (post-GAP-25.15 gate
# coverage marker). Same regex used by audit-novel-source-discovery.py.
NOVEL_HEADER_RE = re.compile(r"^#{2,6}\s+Novel Source Discovery", re.MULTILINE)

# Common false positives for Author-Year that should be filtered:
# - Section headings like "Section 5", "Step 1990"... (year part filters most)
# - Calendar dates already covered by year format (1960-2039)
# - Common boilerplate: "Anthropic 2024", "Claude 2024" -- not real citations
AY_BLOCKLIST = {
    # AI tools / vendors (frequently mentioned in process docs)
    "Anthropic",
    "Claude",
    "OpenAI",
    "ChatGPT",
    # Tool / framework names commonly mentioned in process docs
    "Lattice",
    "GitHub",
    "Slack",
    "Datagrok",
    "PointCross",
    "Nimble",
    # Conference / venue names: <name> <year> is a venue ref, not a citation
    "NeurIPS",
    "ICML",
    "ICLR",
    "AAAI",
    "SOT",
    "STP",
    "PhUSE",
    "DIA",
    "CDISC",
    "FDA",
    "EMA",
    "EFSA",
    "ICH",
    "OECD",
    "EPA",
    "ECETOC",
    "TransCelerate",
    # Months: "May 2025", "December 2025", etc. are dates, not citations
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    # Common verbs/nouns that capitalize at start of sentence + happen near a year
    "The",
    "This",
    "These",
    "Section",
    "Step",
    "Round",
    "Phase",
    "Table",
    "Figure",
    "Spec",
    "Commit",
    "Cycle",
    "Sweep",
    "Audit",
    "Review",
    "Decision",
}


def trim_punct(s: str) -> str:
    """Strip trailing markdown / sentence punctuation that isn't part of a DOI."""
    return s.rstrip(".,);:]'\"")


def extract_citations(text: str) -> list[tuple[int, str, str]]:
    """Return list of (line_number, class, citation_text)."""
    out = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        # Skip code blocks / table separators / very short lines
        if line.startswith(("```", "|---", "    ")) and "10." not in line:
            continue
        for m in DOI_RE.finditer(line):
            doi = trim_punct(m.group(0))
            out.append((lineno, "DOI", doi))
        for m in PMID_RE.finditer(line):
            pmid = m.group(1) or m.group(2)
            out.append((lineno, "PMID", pmid))
        for m in AY_RE.finditer(line):
            author = m.group(1).strip()
            year = m.group(2)
            # Filter blocklist: first word of the author chunk
            first_word = author.split()[0]
            if first_word in AY_BLOCKLIST:
                continue
            out.append((lineno, "AY", f"{author} {year}"))
    return out


def file_mode(text: str) -> str:
    """Return 'novel' if file has a Novel Source Discovery header, else 'standard'."""
    return "novel" if NOVEL_HEADER_RE.search(text) else "standard"


# GAP-25.15.3: standard-mode strict-mode helpers.
# A standard-mode AY citation conforms if the same line contains a DOI/PMID
# OR an explicit "(no DOI" annotation (case-insensitive prefix is enough; lets
# reviewers write "(no DOI available)" / "(no DOI -- textbook)" / etc.).
NO_DOI_ANNOTATION_RE = re.compile(r"\(no\s+doi", re.IGNORECASE)


def strict_violations(text: str) -> list[tuple[int, str]]:
    """For standard-mode-strict mode: return (line_number, line_text) for every
    line that has an AY citation but lacks an adjacent DOI/PMID/'(no DOI' annotation.
    """
    out = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        # Skip code blocks / table separators / very short lines
        if line.startswith(("```", "|---", "    ")) and "10." not in line:
            continue
        # Find AY citations on this line, skipping blocklist
        ays = []
        for m in AY_RE.finditer(line):
            first_word = m.group(1).split()[0]
            if first_word in AY_BLOCKLIST:
                continue
            ays.append(f"{m.group(1).strip()} {m.group(2)}")
        if not ays:
            continue
        # Check if line is conforming
        has_doi = bool(DOI_RE.search(line))
        has_pmid = bool(PMID_RE.search(line))
        has_no_doi = bool(NO_DOI_ANNOTATION_RE.search(line))
        if has_doi or has_pmid or has_no_doi:
            continue
        # All AYs on this line are violations
        ay_str = ", ".join(ays)
        out.append((lineno, f"{ay_str}  -- in line: {line.strip()[:120]}"))
    return out


def audit_dir(root: Path) -> str:
    """Walk root, build the report string."""
    if not root.exists() or not root.is_dir():
        return f"ERROR: not a directory: {root}\n"

    files = sorted(root.rglob("*.md"))
    if not files:
        return f"No .md files under {root}\n"

    by_mode = {"novel": [], "standard": []}
    summary = {"novel": {"DOI": 0, "PMID": 0, "AY": 0}, "standard": {"DOI": 0, "PMID": 0, "AY": 0}}

    sections = []
    for f in files:
        text = f.read_text(encoding="utf-8", errors="replace")
        mode = file_mode(text)
        cites = extract_citations(text)
        # De-duplicate within file (same citation may appear multiple times)
        seen = set()
        deduped = []
        for lineno, cls, txt in cites:
            key = (cls, txt)
            if key in seen:
                continue
            seen.add(key)
            deduped.append((lineno, cls, txt))
            summary[mode][cls] += 1
        by_mode[mode].append((f, deduped))

        # Per-file section
        rel = f.relative_to(root) if f.is_relative_to(root) else f
        section = [f"### {rel}  [mode={mode}]  ({len(deduped)} unique citation(s))"]
        if not deduped:
            section.append("  (none extracted)")
        else:
            for lineno, cls, txt in deduped:
                section.append(f"  L{lineno:5d}  {cls:5s}  {txt}")
        sections.append("\n".join(section))

    header = [
        "# Peer-Review Citation Audit (GAP-25.15.2)",
        "",
        f"Scanned: {root}  ({len(files)} file(s))",
        "",
        "## Summary by mode",
        "",
        "| mode | DOI | PMID | AY |",
        "|---|---:|---:|---:|",
        f"| novel    | {summary['novel']['DOI']} | {summary['novel']['PMID']} | {summary['novel']['AY']} |",
        f"| standard | {summary['standard']['DOI']} | {summary['standard']['PMID']} | {summary['standard']['AY']} |",
        "",
        "Mode `novel` = file has `## Novel Source Discovery` header (post-GAP-25.15",
        "gate-protected forward-looking). Mode `standard` = no novel-source section",
        "(predates the gate or uses standard-mode literature checks; not currently",
        "gate-protected -- see GAP-25.15.3).",
        "",
        "Citation classes:",
        "- **DOI**  -- `10.<reg>/<suffix>` pattern. Mechanically verifiable via",
        "  `https://doi.org/<doi>`.",
        "- **PMID** -- explicit `PMID:` or pubmed URL. Verifiable via PubMed.",
        "- **AY**   -- Author-Year only (no DOI/PMID nearby). Cannot be verified",
        "  mechanically; the 2026-05-01 sweep failures (Sewell 2022, Kerlin & Bolon",
        "  2024, Bailey 2023) were AY-only citations that resolved to nothing on",
        "  manual lookup. **A file with high AY count + low DOI count is the highest",
        "  hallucination risk surface in the corpus.**",
        "",
        "## Per-file extraction",
        "",
    ]
    return "\n".join(header) + "\n\n".join(sections) + "\n"


def run_strict_audit(root: Path, baseline_path: Path | None) -> int:
    """GAP-25.15.3: standard-mode-strict mode.
    Walk standard-mode files, flag every line with an AY citation that lacks
    an adjacent DOI/PMID/'(no DOI' annotation. Respects an optional baseline
    file (one path per line, relative to root) of pre-existing files exempt
    from strict checking. Returns 0 if no new violations, 1 otherwise.
    """
    if not root.exists() or not root.is_dir():
        print(f"ERROR: not a directory: {root}", file=sys.stderr)
        return 2

    baseline = set()
    if baseline_path and baseline_path.is_file():
        for raw in baseline_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#"):
                baseline.add(line)

    files = sorted(root.rglob("*.md"))
    if not files:
        print(f"No .md files under {root}", file=sys.stderr)
        return 0

    overall_violations = 0
    flagged_files = 0
    for f in files:
        text = f.read_text(encoding="utf-8", errors="replace")
        if file_mode(text) != "standard":
            continue
        rel = str(f.relative_to(root)) if f.is_relative_to(root) else str(f)
        rel_norm = rel.replace("\\", "/")
        if rel_norm in baseline:
            continue
        viols = strict_violations(text)
        if not viols:
            continue
        flagged_files += 1
        overall_violations += len(viols)
        print(f"FAIL: {rel_norm} ({len(viols)} violation(s))", file=sys.stderr)
        for lineno, msg in viols:
            print(f"  L{lineno}: {msg}", file=sys.stderr)
        print("", file=sys.stderr)

    if overall_violations == 0:
        print(
            f"PASS: standard-mode-strict audit clean ({len(files)} files scanned, "
            f"{len(baseline)} baseline-exempt).",
            file=sys.stderr,
        )
        return 0

    print(
        f"FAIL: {overall_violations} violation(s) across {flagged_files} standard-mode file(s).",
        file=sys.stderr,
    )
    print("", file=sys.stderr)
    print(
        "Per the GAP-25.15.3 standard-mode citation hygiene rule "
        "(commands/lattice/peer-review.md Section 5):",
        file=sys.stderr,
    )
    print(
        "  - Every author-year citation must include either an adjacent DOI/PMID",
        file=sys.stderr,
    )
    print(
        "    OR an explicit '(no DOI available)' annotation on the same line.",
        file=sys.stderr,
    )
    print(
        "  - To exempt a file as pre-existing tech debt, add its relative path",
        file=sys.stderr,
    )
    print(
        f"    to a baseline file (default: `{baseline_path}` if --baseline given,",
        file=sys.stderr,
    )
    print(
        "    otherwise no baseline applied).",
        file=sys.stderr,
    )
    return 1


def main() -> int:
    args = sys.argv[1:]
    strict_mode = False
    baseline_path = None

    # Parse flags
    positional = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--standard-mode-strict":
            strict_mode = True
        elif a == "--baseline":
            i += 1
            if i >= len(args):
                print("ERROR: --baseline requires a path argument", file=sys.stderr)
                return 2
            baseline_path = Path(args[i])
        elif a.startswith("--baseline="):
            baseline_path = Path(a.split("=", 1)[1])
        elif a.startswith("--"):
            print(f"ERROR: unknown flag {a}", file=sys.stderr)
            return 2
        else:
            positional.append(a)
        i += 1

    if len(positional) > 1:
        print(
            "usage: audit-peer-review-citations.py [--standard-mode-strict] "
            "[--baseline=PATH] [<peer-reviews-dir>]",
            file=sys.stderr,
        )
        return 2

    if positional:
        root = Path(positional[0])
    else:
        root = Path("docs/_internal/research/peer-reviews")

    if strict_mode:
        return run_strict_audit(root, baseline_path)

    # Default: extraction-only report
    report = audit_dir(root)
    print(report)

    # Also persist to .lattice/peer-review-citation-audit.txt if .lattice exists.
    # D1 worktree-aware: prefer LATTICE_PROJECT_ROOT when set (env-var fallback
    # for sessions running in a worktree without symlink support).
    import os
    lattice_root = os.environ.get("LATTICE_PROJECT_ROOT", ".")
    lattice_dir = Path(lattice_root) / ".lattice"
    if lattice_dir.is_dir():
        out = lattice_dir / "peer-review-citation-audit.txt"
        out.write_text(report, encoding="utf-8")
        print(f"\n[written to {out}]", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
