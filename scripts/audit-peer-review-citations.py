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


def main() -> int:
    if len(sys.argv) > 2:
        print("usage: audit-peer-review-citations.py [<peer-reviews-dir>]", file=sys.stderr)
        return 2

    if len(sys.argv) == 2:
        root = Path(sys.argv[1])
    else:
        root = Path("docs/_internal/research/peer-reviews")

    report = audit_dir(root)
    print(report)

    # Also persist to .lattice/peer-review-citation-audit.txt if .lattice exists
    lattice_dir = Path(".lattice")
    if lattice_dir.is_dir():
        out = lattice_dir / "peer-review-citation-audit.txt"
        out.write_text(report, encoding="utf-8")
        print(f"\n[written to {out}]", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
