#!/usr/bin/env python3
"""
sync-workflow-includes.py

Propagates `workflows/_includes/science-flag-resolution.yaml` into the three
consumer workflows (blueprint, research, bug-fix). The lattice executor
(`executor/src/loader.ts`) does not natively support sub-workflow includes,
so the smallest viable mechanism is template-substitution + delimited
marker regions.

Each consumer workflow has a region:

    # === BEGIN SCIENCE-FLAG-MEMO (synced from _includes/science-flag-resolution.yaml) ===
    ...
    # === END SCIENCE-FLAG-MEMO ===

This script reads the include, substitutes the consumer's placeholder
manifest, and replaces the region. Run `node executor/dist/cli.js validate`
after sync to verify the YAML parses and the DAG is acyclic.

Usage:
    python scripts/sync-workflow-includes.py [--check]

`--check` exits non-zero if any consumer is out of sync (suitable for CI).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Repo root = parent of this script's directory.
ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ROOT / "workflows" / "_includes" / "science-flag-resolution.yaml"

BEGIN_MARKER = (
    "    # === BEGIN SCIENCE-FLAG-MEMO "
    "(synced from _includes/science-flag-resolution.yaml) ==="
)
END_MARKER = "    # === END SCIENCE-FLAG-MEMO ==="

# Per-consumer manifests. Each dict maps placeholder -> value.
CONSUMERS: dict[str, dict[str, str]] = {
    "blueprint-cycle.yaml": {
        "PREFIX": "architect",
        "UPSTREAM": "architect-verdict",
        "RESOLVED_ROUTE": "plan-review-r1",
        "REVISE_ROUTE": "synthesize",
        "REVISE_LABEL": "Reject -- revise synthesis to preserve current behavior",
        "LOG_TAG": "architect",
        "MEMO_INTRO": (
            "SCIENCE-FLAG raised by architect or probe on the build plan for\n"
            "        topic {{inputs.topic}}. For each flagged item, attempt to author\n"
            "        a decision memo with at least 3 literature citations that justify\n"
            "        either accepting the analytical behavior change or rejecting it\n"
            "        (revise synthesis to preserve current behavior)."
        ),
    },
    "research-cycle.yaml": {
        "PREFIX": "probe",
        "UPSTREAM": "probe-gate",
        "RESOLVED_ROUTE": "verify-gaps",
        "REVISE_ROUTE": "research",
        "REVISE_LABEL": "Reject -- revise research",
        "LOG_TAG": "probe",
        "MEMO_INTRO": (
            "Probe raised SCIENCE-FLAG on research for topic {{inputs.topic}}\n"
            "        -- analytical behavior implications detected from cross-system\n"
            "        propagation analysis. For each flagged item, attempt to author\n"
            "        a decision memo with at least 3 literature citations that justify\n"
            "        either accepting the analytical behavior change or rejecting it\n"
            "        (revise research to address the implication)."
        ),
    },
    "bug-fix-cycle.yaml": {
        "PREFIX": "self-fix",
        "UPSTREAM": "self-fix-gate",
        "RESOLVED_ROUTE": "update-artifacts",
        "REVISE_ROUTE": "fix",
        "REVISE_LABEL": "Revise fix to preserve current behavior",
        "LOG_TAG": "bug-fix",
        "MEMO_INTRO": (
            "Review raised SCIENCE-FLAG on bug fix for topic {{inputs.topic}}\n"
            "        -- the fix would change analytical behavior. For each flagged\n"
            "        item, attempt to author a decision memo with at least 3\n"
            "        literature citations that justify either accepting the change\n"
            "        (the new behavior is more correct) or rejecting it (revise the\n"
            "        fix to preserve current behavior)."
        ),
    },
}


def load_template_body() -> str:
    """Strip the leading comment header from the include so only the YAML
    fragment is propagated. The fragment begins at the first non-comment,
    non-blank line."""
    raw = INCLUDE.read_text(encoding="utf-8")
    lines = raw.splitlines()
    body_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            body_start = i
            break
    return "\n".join(lines[body_start:]).rstrip() + "\n"


def substitute(template: str, manifest: dict[str, str]) -> str:
    out = template
    for key, value in manifest.items():
        out = out.replace("${" + key + "}", value)
    # Detect any unsubstituted placeholders.
    leftover = re.findall(r"\$\{[A-Z_]+\}", out)
    if leftover:
        raise SystemExit(
            f"sync-workflow-includes: unsubstituted placeholders {leftover}"
        )
    return out


def sync_consumer(path: Path, manifest: dict[str, str], template: str, check: bool) -> bool:
    """Returns True if the consumer was already in sync, False if not."""
    content = path.read_text(encoding="utf-8")

    if BEGIN_MARKER not in content or END_MARKER not in content:
        raise SystemExit(
            f"sync-workflow-includes: {path.name} missing markers; "
            f"add `{BEGIN_MARKER}` / `{END_MARKER}` around the science-memo block"
        )

    rendered = substitute(template, manifest).rstrip()

    new_region = f"{BEGIN_MARKER}\n{rendered}\n{END_MARKER}"

    pattern = re.compile(
        re.escape(BEGIN_MARKER) + r".*?" + re.escape(END_MARKER),
        re.DOTALL,
    )
    new_content = pattern.sub(lambda _m: new_region, content, count=1)

    if new_content == content:
        return True
    if check:
        print(f"OUT-OF-SYNC: {path.name}", file=sys.stderr)
        return False
    path.write_text(new_content, encoding="utf-8")
    print(f"synced: {path.name}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="Exit non-zero if any consumer is out of sync.")
    parsed = parser.parse_args()

    template = load_template_body()
    all_in_sync = True
    for filename, manifest in CONSUMERS.items():
        path = ROOT / "workflows" / filename
        if not path.exists():
            raise SystemExit(f"sync-workflow-includes: missing consumer {path}")
        in_sync = sync_consumer(path, manifest, template, parsed.check)
        all_in_sync = all_in_sync and in_sync

    if parsed.check and not all_in_sync:
        print("\nRun `python scripts/sync-workflow-includes.py` to fix.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
