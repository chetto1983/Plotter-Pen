#!/usr/bin/env bash
# deadcode_pre_push.sh — the pre-push entry point for the Go dead-code gate.
#
# A script rather than an inline `run:` because lefthook runs commands through `env`, and
# double quotes nested inside a single-quoted `bash -c '…'` string are mangled before any
# shell sees them: the gate would fail without ever running. `make deadcode` calls
# deadcode_gate.sh directly with an explicit binary.
set -euo pipefail

cd "$(dirname "$0")/.."

bin="${DEADCODE_BIN:-}"
if [ -z "$bin" ]; then
  bin="$(command -v deadcode || true)"
fi
if [ -z "$bin" ]; then
  bin="$(go env GOPATH)/bin/deadcode"
fi

exec bash scripts/deadcode_gate.sh "$bin" -test $(bash scripts/go_packages.sh)
