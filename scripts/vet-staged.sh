#!/usr/bin/env bash
# Vet the packages containing the given Go files. Called by lefthook pre-commit with
# {staged_files}; safe to run standalone: scripts/vet-staged.sh file1.go file2.go ...
#
# Whole packages, because `go vet` refuses a partial file set, but only the packages this
# commit touches, so a docs-only commit does not pay for a whole-module vet. `make vet` is
# the full sweep.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  exit 0
fi

# Skip directories with no buildable .go file left (the commit deleted the last one, or
# build tags exclude them all): `go vet` fails on those although there is nothing to vet.
# `go list` resolves build tags, which a plain glob cannot.
dirs=()
while IFS= read -r dir; do
  if compgen -G "$dir/*.go" >/dev/null 2>&1 && go list "./$dir" >/dev/null 2>&1; then
    dirs+=("./$dir")
  fi
done < <(for f in "$@"; do dirname "$f"; done | sort -u)

if [ "${#dirs[@]}" -eq 0 ]; then
  exit 0
fi

go vet "${dirs[@]}"
