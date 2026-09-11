#!/usr/bin/env bash
# check-file-size.sh — enforce the AGENTS.md cap on code files (≤600 LOC).
# Runs against Go and JavaScript sources (tests included); node_modules, build
# `dist/` and vendored files are exempt.
#
# AGENTS.md caps NEW files; larger existing files are split only when a change
# needs it. The pre-commit hook therefore passes only added files, while the
# whole-tree mode (`make file-size`) lists every file over the cap.
#
# Usage:
#   bash scripts/check-file-size.sh                    # whole tree (make file-size)
#   bash scripts/check-file-size.sh 800                # override cap
#   bash scripts/check-file-size.sh file1.go file2.js  # only the given files (lefthook)
#   bash scripts/check-file-size.sh 800 file1.go       # both
#
# Exit codes:
#   0 — all checked files within cap
#   1 — at least one file over the cap (full list printed)
#   2 — usage error

set -euo pipefail

CAP=600
if [ "$#" -gt 0 ] && [[ "$1" =~ ^[0-9]+$ ]]; then
  CAP="$1"
  shift
elif [ "$#" -gt 0 ] && [[ "$1" == -* ]]; then
  echo "usage: $0 [cap] [file...]" >&2
  exit 2
fi

# Source files this cap governs. Applied to both modes so a caller-supplied list
# honours the same exemptions. src/lib/es-module-shims.js is a vendored copy.
select_targets() {
  grep -E '\.(go|js)$' \
    | grep -v -E '(^|/)node_modules/' \
    | grep -v -E '(^|/)dist/' \
    | grep -v -E '^src/lib/es-module-shims\.js$' \
    || true
}

if [ "$#" -gt 0 ]; then
  TARGETS=$(printf '%s\n' "$@" | select_targets)
  MODE="named"
else
  TARGETS=$(git ls-files '*.go' '*.js' | select_targets)
  MODE="tree"
fi

# Drop paths absent from the working tree: `git ls-files` lists tracked paths that
# may be deleted-but-unstaged, and a missing path would make `wc` fail under `set -e`.
EXISTING=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  EXISTING="${EXISTING}${f}"$'\n'
done < <(printf '%s\n' "$TARGETS")

if [ -z "$EXISTING" ]; then
  echo "check-file-size: no source files matched; nothing to check."
  exit 0
fi

COUNT=$(printf '%s' "$EXISTING" | grep -c '')
if [ "$MODE" = "named" ]; then
  SCOPE="$COUNT named file(s)"
else
  SCOPE="all $COUNT tracked source file(s)"
fi

# Batched `wc` instead of one spawn per file: process spawns are slow on Windows Git
# Bash. Process substitution (not a here-string) keeps the loop in the current shell so
# the counter and the exit code propagate.
violations=0
while read -r lines path; do
  # `wc` appends a "N total" line per batch of 2+ files.
  [ "$path" = "total" ] && continue
  if [ "$lines" -gt "$CAP" ]; then
    printf "OVER CAP: %s (%d LOC > %d)\n" "$path" "$lines" "$CAP"
    violations=$((violations + 1))
  fi
done < <(printf '%s' "$EXISTING" | tr '\n' '\0' | xargs -0 -r wc -l)

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "check-file-size: $violations file(s) exceed the ${CAP}-LOC cap." >&2
  echo "Split by responsibility (<name>_<concern>.go / .js), see AGENTS.md." >&2
  exit 1
fi

echo "check-file-size: ${SCOPE} within the ${CAP}-LOC cap."
