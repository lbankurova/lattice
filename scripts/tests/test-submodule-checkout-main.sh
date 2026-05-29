#!/bin/bash
# test-submodule-checkout-main.sh -- scenarios for submodule-checkout-main.sh.
# Usage: bash scripts/tests/test-submodule-checkout-main.sh
# Exit: 0 = all pass.
set -uo pipefail
ROOT_REAL=$(cd "$(dirname "$0")/../.." && pwd)
SUT="$ROOT_REAL/scripts/submodule-checkout-main.sh"
[ -f "$SUT" ] || { echo "ERROR: $SUT not found"; exit 1; }
ok=0; fail=0
assert(){ if [ "$2" = "$3" ]; then echo "  PASS  $1"; ok=$((ok+1)); else echo "  FAIL  $1 (got [$2] want [$3])"; fail=$((fail+1)); fi; }

build(){
    TMP=$(mktemp -d)
    SUB="$TMP/subremote"; mkdir "$SUB"; (cd "$SUB" && git init -q -b main \
        && git config user.email t@t && git config user.name t \
        && printf 'l1\nl2\n' > file.txt && git add file.txt && git commit -qm c1 \
        && echo extra >> file.txt && git commit -qam c2)
    PAR="$TMP/parent"; mkdir "$PAR"; (cd "$PAR" && git init -q -b master \
        && git config user.email t@t && git config user.name t \
        && git -c protocol.file.allow=always submodule add -q "$SUB" sub 2>/dev/null \
        && git commit -qm addsub)
    echo "$TMP"
}
head_of(){ git -C "$1/parent/sub" symbolic-ref --short HEAD 2>/dev/null || echo DETACHED; }

# S1: detached + clean -> main
T=$(build); S="$T/parent/sub"; C2=$(git -C "$S" rev-parse HEAD)
git -C "$S" checkout -q "$C2"; (cd "$T/parent" && bash "$SUT" >/dev/null 2>&1)
assert "detached+clean -> main" "$(head_of "$T")" "main"; rm -rf "$T"

# S2: detached + dirty non-conflict -> main, change kept
T=$(build); S="$T/parent/sub"; C2=$(git -C "$S" rev-parse HEAD)
git -C "$S" checkout -q "$C2"; echo new > "$S/added.txt"; (cd "$T/parent" && bash "$SUT" >/dev/null 2>&1)
assert "detached+dirty(carry) -> main" "$(head_of "$T")" "main"
assert "detached+dirty(carry) keeps change" "$([ -f "$S/added.txt" ] && echo yes)" "yes"; rm -rf "$T"

# S3: already on main -> no-op (silent)
T=$(build); S="$T/parent/sub"; git -C "$S" checkout -q main
out="$(cd "$T/parent" && bash "$SUT" 2>&1)"
assert "on-main -> silent no-op" "$([ -z "$out" ] && echo silent)" "silent"
assert "on-main stays main" "$(head_of "$T")" "main"; rm -rf "$T"

# S4: detached + dirty conflict -> git refuses, stays detached
T=$(build); S="$T/parent/sub"; C1=$(git -C "$S" rev-parse HEAD~1)
git -C "$S" checkout -q "$C1"; printf 'CONFLICT\nl2\n' > "$S/file.txt"
(cd "$T/parent" && bash "$SUT" >/dev/null 2>&1)
assert "detached+conflict stays detached (git refused)" "$(head_of "$T")" "DETACHED"; rm -rf "$T"

echo ""; echo "Tests: $ok passed, $fail failed"
[ "$fail" -gt 0 ] && exit 1; exit 0
