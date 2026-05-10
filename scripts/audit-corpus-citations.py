#!/usr/bin/env python3
"""
audit-corpus-citations.py [<docs-root>]

Corpus-wide citation audit (corpus-citation-audit Phase A).

Scope (vs. audit-peer-review-citations.py): that script extracts cites from
peer-reviews only. This one walks the entire docs/ corpus, cross-references
each unique paper against `research/literature/` notes, classifies load-
bearing per 5 user-confirmed criteria, and identifies acquisition + registry
gaps.

Default scan root: `docs/` from CWD.

Three passes in a single corpus walk:

  Pass 1 (corpus extraction): Walk all .md under docs/ with exclusions
    (_archived/, incoming/archive/, docs/methods.md, docs/scientific-logic.md).
    Reuse DOI/PMID/AY regex + AY blocklist from audit-peer-review-citations.py.
    Bucket per-file by directory: peer-reviews | knowledge | literature |
    research | incoming | audits | architecture | decisions | views |
    checklists | reports | designs | platform | reference | help | public | other.

  Pass 2 (registry cross-reference): For each unique paper (deduped by DOI
    > PMID > author-year key), check `docs/_internal/research/literature/`
    for a matching note. Parse note frontmatter: `url:` (DOI), `authors:` +
    `year:` (AY key), `local_pdf:`. Build the 4-quadrant matrix:
      cited+note, cited+no-note, note+cited (orphan-cited), note+orphan.

  Pass 2.5 (PDF reconciliation): Walk research/**/*.pdf. For each PDF,
    check whether any literature note has `local_pdf:` pointing to it.
    Orphan PDFs = files in research/ with no note backlink.

Load-bearing identifier (5 criteria, OR'd):

  (a) cited in knowledge/                                 [-> bucket=knowledge]
  (b) primary anchor in a peer-review verdict             [heuristic: cite
                                                           appears in peer-review
                                                           AND nearby line has
                                                           "anchor", "primary",
                                                           "load-bearing", or
                                                           "N independent sources"]
  (c) cited in incoming/<active-spec>.md (NOT archive)    [-> bucket=incoming]
  (d) cited in architecture/                              [-> bucket=architecture]
  (e) typed-graph fact derives_from this source           [literature note path
                                                           appears in
                                                           knowledge-graph.md
                                                           `derives_from:` line]

Output: text report to stdout, also persisted to
`.lattice/corpus-citation-audit.txt` when `.lattice/` exists. Phase B-E
agents (WebFetch acquisition, peer-review R1/R2) consume the report.

Conventions (do not break without updating this script):

- KG facts must cite literature notes via `research/literature/<slug>.md`
  paths in `derives_from:` YAML lists. Bare DOI/PMID strings in
  `derives_from:` are NOT detected. AY strings cited in `caveats:` prose
  blocks are not promoted to `derives_from_kg` priority -- they remain at
  `knowledge/` bucket priority (R2 review 2026-05-02 finding (a)).
- The `audits/` bucket IS load-bearing -- decision-driving anchors live
  there (e.g., behavioral-grading anchors in compound-profile-audit.md).
  Removing it from the load-bearing predicate would silently demote
  these (R1 review 2026-05-02 finding (a)).
- Validation reference cards (`docs/validation/references/*.yaml`) are
  out of scope -- audit walks `.md` only. Volume is low (1 cite across
  11 cards as of 2026-05-02). Defer YAML-aware extension to follow-up.

Per pcc TODO.md corpus-citation-audit (post-GAP-25.15 family).
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Citation regex / blocklist (copied from audit-peer-review-citations.py to
# keep this script self-contained; both files sync via sync-skills.sh)
# ---------------------------------------------------------------------------

DOI_RE = re.compile(r"\b10\.\d{4,9}/[\w\.\-/_:;()]+", re.IGNORECASE)
PMID_RE = re.compile(
    r"(?:PMID[\s:]+(\d{4,9})|pubmed\.ncbi\.nlm\.nih\.gov/(\d{4,9}))",
    re.IGNORECASE,
)
AY_RE = re.compile(
    r"\b([A-Z][a-zA-Z]{2,}(?:\s*&\s*[A-Z][a-zA-Z]{2,})?(?:\s+et\s+al\.?)?)\s+(19[6-9]\d|20[0-3]\d)\b"
)

AY_BLOCKLIST = {
    # AI tools / vendors (frequently mentioned in process docs)
    "Anthropic", "Claude", "OpenAI", "ChatGPT",
    # Tool / framework / project names
    "Lattice", "GitHub", "Slack", "Datagrok", "PointCross", "Nimble",
    "Sendex", "SENDEX",
    # Conference venues: <name> <year> is venue noise (NOT regulatory bodies --
    # FDA/EMA/EPA/OECD/ICH stay OUT of blocklist for corpus audit so that
    # regulatory citations like "FDA 2020", "EPA 1991", "OECD 408 2018" land as
    # real cites and match their literature notes; the peer-review extractor
    # filters these via its own copy of the blocklist).
    "NeurIPS", "ICML", "ICLR", "AAAI",
    "SOT", "STP", "PhUSE", "DIA", "CDISC", "ECETOC", "TransCelerate",
    # Months
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
    # Sentence-start words that show up near a year
    "The", "This", "These", "Section", "Step", "Round", "Phase",
    "Table", "Figure", "Spec", "Commit", "Cycle", "Sweep", "Audit",
    "Review", "Decision",
    # Sentence-flow / temporal words (caught by smoke run 2026-05-02)
    "Added", "Until", "Through", "Since", "From", "After", "Before",
    "Note", "When", "Where", "Within", "Per", "Following", "During",
    # Status verbs that precede dates in process docs
    "Resolved", "Submitted", "Accepted", "Published", "Approved",
    "Created", "Closed", "Opened", "Completed", "Logged", "Filed",
    "Updated", "Deferred", "Started", "Shipped", "Landed",
    "Decided", "Generated", "Committed", "Merged",
    # ALL-CAPS process tokens (caught by R1+R2 corpus audit 2026-05-02 --
    # Python's str matching is case-sensitive, so ALL-CAPS variants need
    # their own entries even when title-case is already blocklisted)
    "CUT", "SHIPPED", "RESOLVED", "AMENDMENT", "SIMPLIFY",
    "LANDED", "DEFERRED", "OPENED", "CLOSED", "MERGED", "COMMITTED",
    "DECIDED", "GENERATED", "PUBLISHED", "APPROVED", "ACCEPTED",
    # 3-letter month abbreviations
    "Jan", "Feb", "Mar", "Apr", "Jun", "Jul",
    "Aug", "Sep", "Sept", "Oct", "Nov", "Dec",
    # Journal-name fragments mistaken for surnames in inline citations
    "Tox", "Rev", "Pharmacol", "Immunol", "Immunology", "Bioinform",
    "HTS", "DILI", "PMC", "River",
    # Domain-specific tool/process names
    "Playwright",
    # Consortium / society acronyms (R1+R2 finding (e); these emit as
    # AY-form when the consortium name precedes a year, e.g. "ViCoG 2025"
    # -- excluded by default; case-by-case re-inclusion at acquisition time)
    "SITC", "ViCoG", "CONTAM",
    # Document-type words mistaken for surnames
    "Journal", "Guidance", "Opinion", "Consortium", "Report",
    "Position", "Statement", "Letter", "Paper", "Article",
    # Bare three-letter acronyms that aren't author names
    "BMD",
}

# ---------------------------------------------------------------------------
# Bucketing
# ---------------------------------------------------------------------------

# Bucket order matters: first match wins. More specific first.
BUCKETS = [
    ("peer-reviews",  "docs/_internal/research/peer-reviews"),
    ("literature",    "docs/_internal/research/literature"),
    ("knowledge",     "docs/_internal/knowledge"),
    ("incoming",      "docs/_internal/incoming"),
    ("architecture",  "docs/_internal/architecture"),
    ("audits",        "docs/_internal/audits"),
    ("views",         "docs/_internal/views"),
    ("decisions",     "docs/_internal/decisions"),
    ("design-system", "docs/_internal/design-system"),
    ("checklists",    "docs/_internal/checklists"),
    ("reports",       "docs/_internal/reports"),
    ("designs",       "docs/_internal/designs"),
    ("platform",      "docs/_internal/platform"),
    ("reference",     "docs/_internal/reference"),
    ("help",          "docs/_internal/help"),
    ("research",      "docs/_internal/research"),
    ("internal-root", "docs/_internal"),
    ("public",        "docs"),
]

# Files we never scan even when path matches a bucket prefix.
EXCLUDE_PATH_PARTS = {"_archived", "_archive"}
EXCLUDE_DIR_NAMES = {"archive"}  # only flagged when parent is "incoming"

# Specific files to skip (generated docs).
EXCLUDE_FILES = {
    "docs/methods.md",
    "docs/scientific-logic.md",
}

# Load-bearing context keywords: an AY/DOI/PMID cite within ~2 lines of any
# of these in a peer-review file is treated as a primary-anchor citation.
LOAD_BEARING_CONTEXT_RE = re.compile(
    r"(?i)\b(anchor|anchor\s+base|primary\s+source|load-?bearing|"
    r"\d+\s+independent\s+sources?|primary\s+anchor)\b"
)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Cite:
    bucket: str
    file: Path
    lineno: int
    cls: str          # "DOI" | "PMID" | "AY"
    raw: str          # the matched text
    paper_key: str    # canonical dedup key for cross-bucket merge
    near_anchor: bool # True if a load-bearing context keyword sits within 2 lines


@dataclass
class Paper:
    """Aggregated record for one unique paper (deduped across the corpus)."""
    key: str                          # canonical dedup key (doi / pmid / ay-key)
    doi: str | None = None
    pmid: str | None = None
    ay: str | None = None             # human-readable "Author Year" if known
    cites: list[Cite] = field(default_factory=list)
    note_path: Path | None = None     # set if a literature note matches
    note_local_pdf: str | None = None # value of literature note's local_pdf field
    note_inbound_refs: list[str] = field(default_factory=list)
    derives_from_kg: bool = False     # appears in knowledge-graph.md derives_from

    @property
    def buckets(self) -> set[str]:
        return {c.bucket for c in self.cites}

    @property
    def primary_anchor(self) -> bool:
        return any(c.bucket == "peer-reviews" and c.near_anchor for c in self.cites)

    @property
    def load_bearing(self) -> bool:
        b = self.buckets
        return (
            "knowledge" in b
            or "architecture" in b
            or "incoming" in b
            or "audits" in b
            or self.derives_from_kg
            or self.primary_anchor
        )

    def load_bearing_reasons(self) -> list[str]:
        out = []
        b = self.buckets
        if self.derives_from_kg:
            out.append("derives_from in knowledge-graph.md")
        if "knowledge" in b:
            out.append("cited in knowledge/")
        if "architecture" in b:
            out.append("cited in architecture/")
        if "incoming" in b:
            out.append("cited in active incoming/ spec")
        if "audits" in b:
            out.append("cited in audits/")
        if self.primary_anchor:
            out.append("primary anchor in peer-review")
        return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def trim_punct(s: str) -> str:
    return s.rstrip(".,);:]'\"")


def normalize_doi(doi: str) -> str:
    """Lowercase + strip protocol prefix + strip trailing punctuation."""
    s = doi.strip().lower()
    s = re.sub(r"^https?://(dx\.)?doi\.org/", "", s)
    s = trim_punct(s)
    # Strip trailing chars that are common in markdown but not in DOIs
    while s and s[-1] in ").,;]":
        s = s[:-1]
    return s


def ay_key(author: str, year: str) -> str:
    """Stable AY dedup key. Use first surname token only (handles 'Smith & Jones')."""
    first = author.strip().split()[0].lower()
    # Strip trailing punctuation that may have been captured
    first = re.sub(r"[^a-z]", "", first)
    return f"ay:{first}-{year}"


def determine_bucket(rel_path: str) -> str:
    """Map a docs-relative POSIX path to a bucket name."""
    rel = rel_path.replace("\\", "/")
    for name, prefix in BUCKETS:
        if rel.startswith(prefix + "/") or rel == prefix:
            return name
    return "other"


def should_exclude(rel_path: str) -> bool:
    rel = rel_path.replace("\\", "/")
    if rel in EXCLUDE_FILES:
        return True
    parts = rel.split("/")
    for p in parts:
        if p in EXCLUDE_PATH_PARTS:
            return True
    # incoming/archive/ specifically
    if "incoming/archive" in rel:
        return True
    return False


# ---------------------------------------------------------------------------
# Pass 1: extract cites from a single file
# ---------------------------------------------------------------------------

def extract_file_cites(text: str, bucket: str, file: Path) -> list[Cite]:
    out: list[Cite] = []
    lines = text.splitlines()

    # Pre-compute load-bearing context mask: True at line i if line i has the
    # context keyword. Used to flag near-anchor cites in peer-review files.
    anchor_mask = [bool(LOAD_BEARING_CONTEXT_RE.search(ln)) for ln in lines]

    for lineno, line in enumerate(lines, start=1):
        if line.startswith(("```", "|---", "    ")) and "10." not in line:
            continue

        # Window: lines [lineno-2 .. lineno+2] for anchor context detection.
        # (lineno is 1-based, anchor_mask is 0-based)
        idx = lineno - 1
        win = anchor_mask[max(0, idx - 2): min(len(anchor_mask), idx + 3)]
        near = bucket == "peer-reviews" and any(win)

        for m in DOI_RE.finditer(line):
            raw = trim_punct(m.group(0))
            doi = normalize_doi(raw)
            out.append(Cite(bucket, file, lineno, "DOI", raw, f"doi:{doi}", near))

        for m in PMID_RE.finditer(line):
            pmid = (m.group(1) or m.group(2)).strip()
            out.append(Cite(bucket, file, lineno, "PMID", pmid, f"pmid:{pmid}", near))

        for m in AY_RE.finditer(line):
            author = m.group(1).strip()
            year = m.group(2)
            first_word = author.split()[0]
            if first_word in AY_BLOCKLIST:
                continue
            key = ay_key(author, year)
            out.append(Cite(bucket, file, lineno, "AY", f"{author} {year}", key, near))

    return out


# ---------------------------------------------------------------------------
# Literature note frontmatter parser
# ---------------------------------------------------------------------------

FM_OPEN_RE = re.compile(r"^---\s*$", re.MULTILINE)


def parse_frontmatter(text: str) -> dict[str, str | list[str]]:
    """Return frontmatter as a flat dict. Lists supported on `inbound_refs`.
    Conservative parser -- enough for sendex literature note schema."""
    if not text.startswith("---"):
        return {}
    lines = text.splitlines()
    if not lines:
        return {}
    if lines[0].strip() != "---":
        return {}
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}

    fm: dict[str, str | list[str]] = {}
    current_key: str | None = None
    current_list: list[str] | None = None
    for raw in lines[1:end]:
        if not raw.strip():
            current_key = None
            current_list = None
            continue
        # List continuation: "  - value"
        if raw.startswith(("  - ", "- ")) and current_list is not None:
            val = raw.strip()[2:].strip()
            # Trim wrapping quotes
            if (val.startswith('"') and val.endswith('"')) or \
               (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            current_list.append(val)
            continue
        # Key: value
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", raw)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val == "":
            # Begin a list
            current_key = key
            current_list = []
            fm[key] = current_list
        else:
            # Trim wrapping quotes
            if (val.startswith('"') and val.endswith('"')) or \
               (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            fm[key] = val
            current_key = key
            current_list = None
    return fm


@dataclass
class LiteratureNote:
    path: Path
    rel_path: str   # docs-relative POSIX path
    title: str
    authors: str
    year: str
    url: str
    local_pdf: str | None
    status: str
    inbound_refs: list[str]
    keys: set[str] = field(default_factory=set)  # all dedup keys this note matches


def load_literature_notes(lit_dir: Path, docs_root: Path) -> list[LiteratureNote]:
    notes: list[LiteratureNote] = []
    if not lit_dir.is_dir():
        return notes
    for f in sorted(lit_dir.glob("*.md")):
        if f.name.upper() == "README.MD":
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        fm = parse_frontmatter(text)
        if not fm:
            continue
        title = str(fm.get("title", "")).strip()
        authors = str(fm.get("authors", "")).strip()
        year = str(fm.get("year", "")).strip()
        url = str(fm.get("url", "")).strip()
        lp = fm.get("local_pdf")
        local_pdf = None
        if isinstance(lp, str) and lp not in ("", "null", "None"):
            local_pdf = lp.strip()
        status = str(fm.get("status", "")).strip()
        inbound = fm.get("inbound_refs", [])
        if not isinstance(inbound, list):
            inbound = []

        rel = str(f.relative_to(docs_root)).replace("\\", "/") if f.is_relative_to(docs_root) else str(f)

        note = LiteratureNote(
            path=f,
            rel_path=f"docs/{rel}" if not rel.startswith("docs/") else rel,
            title=title,
            authors=authors,
            year=year,
            url=url,
            local_pdf=local_pdf,
            status=status,
            inbound_refs=inbound,
        )

        # Build dedup keys for this note.
        # 1. DOI: extract from url field if it contains "10." pattern.
        if url:
            m = DOI_RE.search(url)
            if m:
                note.keys.add(f"doi:{normalize_doi(m.group(0))}")
        # 2. PMID: occasionally embedded in url or title
        for src in (url, title):
            for m in PMID_RE.finditer(src):
                pmid = (m.group(1) or m.group(2)).strip()
                note.keys.add(f"pmid:{pmid}")
        # 3. AY: from authors + year
        if authors and year:
            first = re.split(r"[,\s]+", authors.strip())[0]
            if first:
                note.keys.add(ay_key(first, year))
        # 4. AY from filename slug (e.g., "kim-2016-cyno-lb" -> ay:kim-2016)
        slug = f.stem
        m = re.match(r"^([a-z]+)-(\d{4})", slug)
        if m:
            note.keys.add(f"ay:{m.group(1)}-{m.group(2)}")

        notes.append(note)
    return notes


# ---------------------------------------------------------------------------
# Pass 2.5: PDF reconciliation
# ---------------------------------------------------------------------------

def find_research_pdfs(docs_root: Path) -> list[Path]:
    research = docs_root / "_internal" / "research"
    if not research.is_dir():
        return []
    return sorted(research.rglob("*.pdf"))


def pdf_backlinked(pdf: Path, notes: list[LiteratureNote], docs_root: Path) -> bool:
    rel_pdf = str(pdf.relative_to(docs_root)).replace("\\", "/")
    rel_pdf_short = rel_pdf.removeprefix("_internal/")
    for n in notes:
        if not n.local_pdf:
            continue
        target = n.local_pdf.replace("\\", "/")
        # Match either the full docs-relative path or the docs/_internal-relative path
        if target.endswith(rel_pdf) or target.endswith(rel_pdf_short) or target == rel_pdf:
            return True
    return False


# ---------------------------------------------------------------------------
# Knowledge-graph derives_from extraction
# ---------------------------------------------------------------------------

DERIVES_FROM_RE = re.compile(
    r"^\s*-\s*(research/literature/[A-Za-z0-9_\-]+\.md)",
)


def kg_derives_from_paths(kg_path: Path) -> set[str]:
    """Return relative paths (e.g. 'research/literature/kim-2016-cyno-lb.md')
    that appear in derives_from lines of knowledge-graph.md."""
    out: set[str] = set()
    if not kg_path.is_file():
        return out
    in_block = False
    for raw in kg_path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = raw.strip()
        if stripped.startswith("derives_from:"):
            in_block = True
            continue
        if in_block:
            m = DERIVES_FROM_RE.match(raw)
            if m:
                out.add(m.group(1))
                continue
            # Block ends when we hit a non-list line that doesn't continue the list
            if stripped.startswith("- "):
                continue
            in_block = False
    return out


# ---------------------------------------------------------------------------
# Main audit driver
# ---------------------------------------------------------------------------

def audit_corpus(docs_root: Path) -> str:
    if not docs_root.is_dir():
        return f"ERROR: not a directory: {docs_root}\n"

    # Pass 1: walk corpus
    cites_per_bucket: dict[str, int] = defaultdict(int)
    files_per_bucket: dict[str, int] = defaultdict(int)
    cites_by_class: dict[str, int] = defaultdict(int)
    all_cites: list[Cite] = []

    files = sorted(docs_root.rglob("*.md"))
    scanned = 0
    excluded = 0
    for f in files:
        rel = str(f.relative_to(docs_root)).replace("\\", "/")
        rel_full = f"docs/{rel}"
        if should_exclude(rel_full):
            excluded += 1
            continue
        bucket = determine_bucket(rel_full)
        scanned += 1
        files_per_bucket[bucket] += 1
        text = f.read_text(encoding="utf-8", errors="replace")
        cites = extract_file_cites(text, bucket, f)
        for c in cites:
            cites_by_class[c.cls] += 1
            cites_per_bucket[bucket] += 1
        all_cites.extend(cites)

    # Pass 2: load literature notes + dedup papers
    lit_notes = load_literature_notes(
        docs_root / "_internal" / "research" / "literature", docs_root
    )

    kg_paths = kg_derives_from_paths(
        docs_root / "_internal" / "knowledge" / "knowledge-graph.md"
    )

    # Index notes by their dedup keys
    note_by_key: dict[str, LiteratureNote] = {}
    for n in lit_notes:
        for k in n.keys:
            note_by_key.setdefault(k, n)

    # Build paper records, keyed by canonical dedup key.
    # Strategy: literature notes can fold multiple keys (DOI + AY-from-filename)
    # into one canonical key. Use the note's preferred key (DOI > PMID > AY) as
    # canonical; otherwise the first cite's key wins.
    key_canonicalizer: dict[str, str] = {}  # raw_key -> canonical_key
    for n in lit_notes:
        # Prefer DOI > PMID > AY for the canonical key
        canonical = None
        for k in n.keys:
            if k.startswith("doi:"):
                canonical = k
                break
        if canonical is None:
            for k in n.keys:
                if k.startswith("pmid:"):
                    canonical = k
                    break
        if canonical is None and n.keys:
            canonical = next(iter(n.keys))
        if canonical is None:
            continue
        for k in n.keys:
            key_canonicalizer[k] = canonical

    def canon(k: str) -> str:
        return key_canonicalizer.get(k, k)

    papers: dict[str, Paper] = {}
    for c in all_cites:
        ck = canon(c.paper_key)
        p = papers.get(ck)
        if p is None:
            p = Paper(key=ck)
            papers[ck] = p
        if ck.startswith("doi:") and not p.doi:
            p.doi = ck[4:]
        elif ck.startswith("pmid:") and not p.pmid:
            p.pmid = ck[5:]
        if c.cls == "DOI" and not p.doi:
            # Cite raw DOI but canonical key is AY (via note bridge); record raw doi
            p.doi = normalize_doi(c.raw)
        if c.cls == "PMID" and not p.pmid:
            p.pmid = c.raw
        if c.cls == "AY" and not p.ay:
            p.ay = c.raw
        p.cites.append(c)

    # Attach literature notes to papers
    for n in lit_notes:
        for k in n.keys:
            ck = canon(k)
            p = papers.get(ck)
            if p is None:
                # Note exists but no cite in corpus -> orphan (we still record it as a Paper)
                p = Paper(key=ck)
                papers[ck] = p
            p.note_path = n.path
            p.note_local_pdf = n.local_pdf
            p.note_inbound_refs = n.inbound_refs
            if not p.doi and any(k2.startswith("doi:") for k2 in n.keys):
                doi_key = next(k2 for k2 in n.keys if k2.startswith("doi:"))
                p.doi = doi_key[4:]
            if not p.ay and n.authors and n.year:
                p.ay = f"{n.authors.split(',')[0].strip()} {n.year}"
            # KG derives_from check
            if n.rel_path.endswith("md"):
                # Relative form to match knowledge-graph.md cites
                short = n.rel_path
                if short.startswith("docs/_internal/"):
                    short = short[len("docs/_internal/"):]
                if short in kg_paths:
                    p.derives_from_kg = True

    # Pass 2.5: PDF orphans
    pdfs = find_research_pdfs(docs_root)
    pdf_orphans = [p for p in pdfs if not pdf_backlinked(p, lit_notes, docs_root)]

    # ----- Build report -----
    lines: list[str] = []
    lines.append("# Corpus Citation Audit")
    lines.append("")
    lines.append(f"Scanned: {docs_root}  ({scanned} files; {excluded} excluded)")
    lines.append("")

    lines.append("## Summary by bucket")
    lines.append("")
    lines.append("| bucket | files | cites |")
    lines.append("|---|---:|---:|")
    for name, _ in BUCKETS:
        if files_per_bucket.get(name, 0) == 0 and cites_per_bucket.get(name, 0) == 0:
            continue
        lines.append(f"| {name} | {files_per_bucket.get(name, 0)} | {cites_per_bucket.get(name, 0)} |")
    other = files_per_bucket.get("other", 0)
    if other:
        lines.append(f"| other | {other} | {cites_per_bucket.get('other', 0)} |")
    lines.append("")
    lines.append("Cites by class:")
    for cls in ("DOI", "PMID", "AY"):
        lines.append(f"- {cls}: {cites_by_class.get(cls, 0)}")
    lines.append("")

    # Unique papers
    unique = list(papers.values())
    cited_papers = [p for p in unique if p.cites]
    load_bearing = [p for p in cited_papers if p.load_bearing]

    lines.append("## Unique papers")
    lines.append("")
    lines.append(f"- Unique papers cited: {len(cited_papers)}")
    lines.append(f"- Load-bearing (any of 5 criteria): {len(load_bearing)}")
    lines.append(f"- With literature note: {sum(1 for p in cited_papers if p.note_path)}")
    lines.append(f"- With local PDF (via note): {sum(1 for p in cited_papers if p.note_local_pdf)}")
    lines.append("")

    # Acquisition candidates (load-bearing, missing note OR PDF)
    def sort_priority(p: Paper) -> tuple[int, str]:
        # Lower number = higher priority
        if p.derives_from_kg:
            prio = 0
        elif "knowledge" in p.buckets:
            prio = 1
        elif "architecture" in p.buckets:
            prio = 2
        elif "incoming" in p.buckets:
            prio = 3
        elif "audits" in p.buckets:
            prio = 4
        elif p.primary_anchor:
            prio = 5
        else:
            prio = 6
        # Secondary sort by criteria-count (more reasons = higher acquisition
        # urgency within the same prio tier; R2 finding (c)). Negate for
        # descending order. Tertiary sort alphabetical for stability.
        return (prio, -len(p.load_bearing_reasons()), p.ay or p.doi or p.key)

    acq_candidates = sorted(
        [p for p in load_bearing if not p.note_path or not p.note_local_pdf],
        key=sort_priority,
    )

    lines.append("## Load-bearing acquisition candidates")
    lines.append("")
    lines.append(
        "Load-bearing papers missing a literature note OR a local PDF. Sorted by"
        " blast radius (knowledge-graph derives_from > knowledge > architecture >"
        " active spec > primary anchor)."
    )
    lines.append("")
    if not acq_candidates:
        lines.append("(none)")
    else:
        lines.append("| paper | doi/pmid/ay | gap | reasons | first cited at |")
        lines.append("|---|---|---|---|---|")
        for p in acq_candidates:
            ident = (
                f"DOI {p.doi}" if p.doi else
                f"PMID {p.pmid}" if p.pmid else
                f"AY {p.ay}" if p.ay else p.key
            )
            if not p.note_path:
                gap = "no note"
            elif not p.note_local_pdf:
                gap = "no PDF"
            else:
                gap = "?"
            reasons = "; ".join(p.load_bearing_reasons()) or "-"
            first = p.cites[0]
            rel_first = str(first.file.relative_to(docs_root)).replace("\\", "/") if first.file.is_relative_to(docs_root) else str(first.file)
            paper_disp = p.ay or p.doi or p.key
            lines.append(f"| {paper_disp} | {ident} | {gap} | {reasons} | {rel_first}:L{first.lineno} |")
    lines.append("")

    # Orphan literature notes (no inbound cites in corpus)
    note_orphans = [n for n in lit_notes if not any(p.note_path == n.path and p.cites for p in cited_papers)]
    # Refine: a note is orphan only if no Paper with cites references it
    note_orphans_real = []
    for n in lit_notes:
        cited = False
        for k in n.keys:
            ck = canon(k)
            p = papers.get(ck)
            if p and p.cites:
                cited = True
                break
        if not cited:
            note_orphans_real.append(n)

    lines.append("## Orphan literature notes")
    lines.append("")
    lines.append(
        "Literature notes whose source has no inbound cite anywhere in the corpus."
        " Per `research/literature/README.md` 'no inbound reference, no literature note'"
        " convention these are archive candidates."
    )
    lines.append("")
    if not note_orphans_real:
        lines.append("(none)")
    else:
        lines.append("| note | status | declared inbound_refs |")
        lines.append("|---|---|---|")
        for n in note_orphans_real:
            refs = ", ".join(n.inbound_refs) if n.inbound_refs else "(none)"
            lines.append(f"| {n.rel_path} | {n.status} | {refs} |")
    lines.append("")

    # Zero-cost resolutions: orphan PDF that matches an acquisition candidate's
    # AY key by filename stem (R2 novel angle 4 + R1 finding (b)). Highest-ROI
    # output of the audit -- PDF already exists locally, only the literature
    # note + local_pdf: wiring is missing. No download cost.
    pdf_filename_re = re.compile(r"^([A-Za-z]+?)[-_]?(\d{4})", re.IGNORECASE)
    zero_cost_matches: list[tuple[Path, Paper]] = []
    for pdf in pdf_orphans:
        m = pdf_filename_re.match(pdf.stem)
        if not m:
            continue
        pdf_ay_key = f"ay:{m.group(1).lower()}-{m.group(2)}"
        # Find any acquisition candidate (load-bearing, no PDF) whose key matches
        for p in acq_candidates:
            if p.note_local_pdf:
                continue
            if pdf_ay_key == p.key or any(pdf_ay_key == canon(k) for k in [p.key]):
                zero_cost_matches.append((pdf, p))
                break
            # Also check the paper's AY field against the PDF's first-author + year
            if p.ay:
                p_first = p.ay.split()[0].lower()
                p_first_clean = re.sub(r"[^a-z]", "", p_first)
                if p_first_clean == m.group(1).lower():
                    # Year match too
                    p_year_match = re.search(r"\b(19[6-9]\d|20[0-3]\d)\b", p.ay)
                    if p_year_match and p_year_match.group(1) == m.group(2):
                        zero_cost_matches.append((pdf, p))
                        break

    lines.append("## Zero-cost resolutions (orphan PDF + acquisition candidate)")
    lines.append("")
    lines.append(
        "Orphan PDFs whose filename stem (`<author><year>` loose match) aligns"
        " with a load-bearing acquisition candidate. PDF already exists locally"
        " -- only the literature note + `local_pdf:` wiring is missing."
        " Highest-ROI close in the audit (no download required)."
    )
    lines.append("")
    if not zero_cost_matches:
        lines.append("(none)")
    else:
        lines.append("| orphan PDF | matched paper | gap |")
        lines.append("|---|---|---|")
        for pdf, paper in zero_cost_matches:
            rel_pdf = str(pdf.relative_to(docs_root)).replace("\\", "/")
            disp = paper.ay or paper.doi or paper.key
            gap = "no note" if not paper.note_path else "no PDF"
            lines.append(f"| docs/{rel_pdf} | {disp} | {gap} |")
    lines.append("")

    # Orphan PDFs (full list, including the zero-cost matches above for cross-ref)
    lines.append("## Orphan PDFs")
    lines.append("")
    lines.append(
        "PDFs in `research/` with no literature note's `local_pdf:` pointing to them."
        " Either (a) wire to a new note, (b) wire to an existing note, or (c) delete."
        " Entries also appearing in the zero-cost-resolutions section above are"
        " marked `[zero-cost]`."
    )
    lines.append("")
    if not pdf_orphans:
        lines.append("(none)")
    else:
        zero_cost_pdfs = {pdf for pdf, _ in zero_cost_matches}
        for pdf in pdf_orphans:
            rel_pdf = str(pdf.relative_to(docs_root)).replace("\\", "/")
            marker = "  [zero-cost]" if pdf in zero_cost_pdfs else ""
            lines.append(f"- docs/{rel_pdf}{marker}")
    lines.append("")

    # Per-bucket detail (concise: per-bucket unique paper list, not per-line dump)
    lines.append("## Per-bucket unique papers")
    lines.append("")
    bucket_to_papers: dict[str, list[Paper]] = defaultdict(list)
    for p in cited_papers:
        for b in p.buckets:
            bucket_to_papers[b].append(p)
    for name, _ in BUCKETS:
        ps = bucket_to_papers.get(name, [])
        if not ps:
            continue
        # Dedup
        seen_keys = set()
        unique_ps = []
        for p in ps:
            if p.key in seen_keys:
                continue
            seen_keys.add(p.key)
            unique_ps.append(p)
        unique_ps.sort(key=lambda p: (p.ay or p.doi or p.key))
        lines.append(f"### {name}  ({len(unique_ps)} unique paper(s))")
        lines.append("")
        for p in unique_ps:
            disp = p.ay or p.doi or p.key
            ident_parts = []
            if p.doi:
                ident_parts.append(f"doi:{p.doi}")
            if p.pmid:
                ident_parts.append(f"pmid:{p.pmid}")
            ident = " ".join(ident_parts) if ident_parts else p.key
            note_marker = " [note]" if p.note_path else ""
            pdf_marker = " [pdf]" if p.note_local_pdf else ""
            lb_marker = " [load-bearing]" if p.load_bearing else ""
            lines.append(f"- {disp}  ({ident}){note_marker}{pdf_marker}{lb_marker}")
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    args = sys.argv[1:]
    if len(args) > 1:
        print(
            "usage: audit-corpus-citations.py [<docs-root>]",
            file=sys.stderr,
        )
        return 2

    if args:
        root = Path(args[0])
    else:
        root = Path("docs")

    report = audit_corpus(root)
    print(report)

    # D1 worktree-aware: prefer LATTICE_PROJECT_ROOT when set (env-var fallback
    # for sessions running in a worktree without symlink support).
    import os
    lattice_root = os.environ.get("LATTICE_PROJECT_ROOT", ".")
    lattice_dir = Path(lattice_root) / ".lattice"
    if lattice_dir.is_dir():
        out = lattice_dir / "corpus-citation-audit.txt"
        out.write_text(report, encoding="utf-8")
        print(f"\n[written to {out}]", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
