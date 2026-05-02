#!/usr/bin/env python3
"""Extract text from the first N pages of a PDF.

Thin PyMuPDF wrapper used by `/lattice:lit-triage` to feed orphan PDF
content into an LLM relevance-assessment pass. The first 3-5 pages
typically capture title, abstract, methods opener, and journal/affiliation
metadata -- enough for triage without paying full-text extraction cost.

Reuses the fitz pattern from backend/etl/validate_hcd_mi_source_csv.py
(DATA-GAP-MIMA-18 extraction protocol) per CLAUDE.md rule 5.

Usage:
    python scripts/extract-pdf-text.py <pdf-path> [--pages N] [--out FILE]

Output format (stdout or --out file):

    === PAGE 1 ===
    <page 1 text>
    === PAGE 2 ===
    <page 2 text>
    ...

Exit codes:
    0 -- success (text extracted)
    1 -- PDF cannot be opened (file missing / corrupt / encrypted)
    2 -- PDF opens but no text extractable on requested pages (likely scanned image)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def extract_pages(pdf_path: Path, n_pages: int) -> list[tuple[int, str]]:
    """Return [(page_num_1_indexed, text), ...] for first n_pages of the PDF.

    Raises FileNotFoundError if pdf_path does not exist.
    Raises RuntimeError if fitz cannot open the file.
    """
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    import fitz  # PyMuPDF

    try:
        doc = fitz.open(str(pdf_path))
    except Exception as exc:
        raise RuntimeError(f"fitz cannot open {pdf_path}: {exc}") from exc

    pages: list[tuple[int, str]] = []
    try:
        upper = min(n_pages, doc.page_count)
        for i in range(upper):
            text = doc[i].get_text()
            pages.append((i + 1, text))
    finally:
        doc.close()
    return pages


def format_pages(pages: list[tuple[int, str]]) -> str:
    chunks = []
    for page_num, text in pages:
        chunks.append(f"=== PAGE {page_num} ===")
        chunks.append(text.rstrip())
    return "\n".join(chunks) + "\n"


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("pdf", type=Path, help="Path to PDF file")
    p.add_argument(
        "--pages",
        type=int,
        default=5,
        help="Number of pages to extract from the start (default 5)",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write extracted text to this file (UTF-8). Default stdout.",
    )
    args = p.parse_args()

    if args.pages < 1:
        print("ERROR: --pages must be >= 1", file=sys.stderr)
        return 1

    try:
        pages = extract_pages(args.pdf, args.pages)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    total_chars = sum(len(text) for _, text in pages)
    if total_chars < 50:
        print(
            f"WARN: only {total_chars} characters extracted across "
            f"{len(pages)} pages -- likely scanned image PDF "
            f"(would need OCR to triage)",
            file=sys.stderr,
        )
        if args.out:
            args.out.write_text(format_pages(pages), encoding="utf-8")
        else:
            sys.stdout.write(format_pages(pages))
        return 2

    output = format_pages(pages)
    if args.out:
        args.out.write_text(output, encoding="utf-8")
        print(
            f"OK: {total_chars} chars across {len(pages)} pages -> {args.out}",
            file=sys.stderr,
        )
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
