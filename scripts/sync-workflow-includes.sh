#!/usr/bin/env bash
# Thin wrapper around sync-workflow-includes.py for shell-script parity with
# other helpers in this directory.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python "${HERE}/sync-workflow-includes.py" "$@"
