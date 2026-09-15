#!/usr/bin/env bash
# Lint the packages containing the given Go files. Called by lefthook pre-commit with
# {staged_files}; safe to run standalone: scripts/lint-staged.sh file1.go file2.go ...
#
# Only the packages this commit touches, and every issue in them, not only the changed lines:
# a package is clean once a commit touches it, and stays clean. Chosen by the user on
# 2026-09-15, when checking only the changed lines (--new-from-rev=HEAD) had let dupl, gofmt
# and modernize findings sit in touched packages. A commit in a package that still carries
# old findings has to fix them first. `make lint` is the full sweep.
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

golangci-lint run "${dirs[@]}"
