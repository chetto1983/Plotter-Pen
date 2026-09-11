#!/usr/bin/env bash
# tagged_tier_compile.sh — compile and vet the build-tagged test files without running them.
#
# They talk to a real PLC (tag integration) or to tools/s7sim (tag s7sim), so running them is
# never a hook's job, but a tagged file nobody compiles rots unnoticed. Tags are discovered
# from the tracked //go:build lines, so a new tier is picked up automatically; only
# single-identifier constraints are supported. Arguments are ignored (lefthook may append
# file names).
set -euo pipefail

cd "$(dirname "$0")/.."

# Slashes escaped: Git for Windows rewrites an argument starting with // as a UNC path.
pairs="$(git grep -E '^\/\/go:build ' -- '*.go' | sed -E 's#^([^:]+)://go:build (.*)$#\2 \1#')"
if [ -z "$pairs" ]; then
  echo "tagged-tier-compile: no build-tagged Go files"
  exit 0
fi

status=0
for tag in $(printf '%s\n' "$pairs" | awk '{ print $1 }' | sort -u); do
  if ! [[ "$tag" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "tagged-tier-compile: unsupported build constraint '$tag'" >&2
    status=1
    continue
  fi
  dirs="$(printf '%s\n' "$pairs" | awk -v t="$tag" '$1 == t { print $2 }' | xargs -n1 dirname | sort -u | sed 's#^#./#')"
  echo "tagged-tier-compile: -tags=$tag" $dirs
  go vet -tags="$tag" $dirs || status=1
done
exit "$status"
