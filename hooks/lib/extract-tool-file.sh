#!/bin/bash
# extract-tool-file.sh -- PostToolUse helper. Reads a Claude Code hook JSON
# payload on stdin and prints tool_input.file_path normalized to forward
# slashes (empty if absent). Extracted to a script so the inline hooks in
# .claude/settings.json need no nested single quotes (which broke parse-time
# quote parity) and no grep -P (unavailable in non-UTF-8 locales). 2026-05-29.
set -uo pipefail
cat 2>/dev/null \
  | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -1 \
  | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/' \
  | tr '\' '/' 2>/dev/null \
  | tr -s '/'
