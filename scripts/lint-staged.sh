#!/usr/bin/env bash
# Lint the packages containing the given Go files. Called by lefthook pre-commit with
# {staged_files}; safe to run standalone: scripts/lint-staged.sh file1.go file2.go ...
#
# Whole packages, because golangci-lint's cross-file analyses need them, but only the
# packages this commit touches. --new-from-rev=HEAD reports only issues on lines changed
# since HEAD: the existing code carried about 140 findings on 2026-09-11, and AGENTS.md asks
# to report unrelated defects instead of widening a change to fix them. `make lint` is the
# full sweep.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  exit 0
fi

# Skip directories with no buildable .go file left (the commit deleted the last one, or
# build tags exclude them all): golangci-lint fails on those although there is nothing to
# lint. `go list` resolves build tags, which a plain glob cannot.
dirs=()
while IFS= read -r dir; do
  if compgen -G "$dir/*.go" >/dev/null 2>&1 && go list "./$dir" >/dev/null 2>&1; then
    dirs+=("./$dir")
  fi
done < <(for f in "$@"; do dirname "$f"; done | sort -u)

if [ "${#dirs[@]}" -eq 0 ]; then
  exit 0
fi

golangci-lint run --new-from-rev=HEAD "${dirs[@]}"
