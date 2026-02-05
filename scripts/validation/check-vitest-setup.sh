#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

echo "Checking Vitest config for removed / footgun options..."

# Vitest 4 removed these options; leaving them around is a silent misconfig risk.
if grep -Rsn --exclude-dir node_modules -E "poolOptions\\b|\\bsingleFork\\b|\\bsingleThread\\b" apps packages >/dev/null; then
  echo "Found one of: poolOptions, singleFork, singleThread" >&2
  grep -Rsn --exclude-dir node_modules -E "poolOptions\\b|\\bsingleFork\\b|\\bsingleThread\\b" apps packages | head -n 50 >&2
  fail "Remove deprecated Vitest pool options and migrate to pool/maxWorkers/isolate."
fi

# This repo uses native modules in apps/web (e.g. @napi-rs/image); Vitest recommends forks
# when native modules misbehave under threads.
if grep -Rsn --exclude-dir node_modules -E "pool:\\s*[\"']threads[\"']|--pool=threads" apps/web >/dev/null; then
  echo "apps/web appears to be configured to use threads pool." >&2
  grep -Rsn --exclude-dir node_modules -E "pool:\\s*[\"']threads[\"']|--pool=threads" apps/web | head -n 50 >&2
  fail "Use forks pool for apps/web (native modules + worker threads are a common failure mode)."
fi

echo "OK: Vitest setup checks passed."

echo "Checking workspace test scripts default to non-watch mode..."

# Best practice: make `test` non-interactive (`vitest run`) to avoid CI hangs.
# Allow packages that don't use Vitest.
MISMATCHES="$(
  find apps packages -name package.json -not -path '*/node_modules/*' -print0 \
    | node -e '
      const fs = require("node:fs");
      const input = fs.readFileSync(0);
      const paths = input.toString("utf8").split("\0").filter(Boolean);

      const mismatches = [];
      for (const p of paths) {
        let json;
        try {
          json = JSON.parse(fs.readFileSync(p, "utf8"));
        } catch {
          continue;
        }

        const testScript = json?.scripts?.test;
        if (!testScript) continue;

        // Only care about packages whose `test` script directly calls vitest.
        const trimmed = String(testScript).trim();
        if (!trimmed.startsWith("vitest")) continue;

        const isRun = /\b(run|--run)\b/.test(trimmed);
        if (!isRun) mismatches.push(`${p}: scripts.test="${trimmed}"`);
      }

      process.stdout.write(mismatches.join("\n"));
    '
)"

if [[ -n "$MISMATCHES" ]]; then
  echo "Found interactive Vitest test scripts (should be 'vitest run'):" >&2
  echo "$MISMATCHES" | head -n 50 >&2
  fail "Update package test scripts to use 'vitest run' and add a separate watch script."
fi

echo "OK: Workspace test scripts look sane."
