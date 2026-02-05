#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

TARGET_VITEST_VERSION="4.0.17"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

echo "Checking workspace Vitest versions are pinned to ${TARGET_VITEST_VERSION}..."

MISMATCHES="$(
  find apps packages -name package.json -not -path '*/node_modules/*' -print0 \
    | node -e '
      const fs = require("node:fs");

      const target = process.argv[1];
      if (!target) process.exit(2);

      const input = fs.readFileSync(0);
      const paths = input.toString("utf8").split("\0").filter(Boolean);

      function depVersion(pkgJson, name) {
        return (
          pkgJson?.devDependencies?.[name]
          ?? pkgJson?.dependencies?.[name]
          ?? pkgJson?.peerDependencies?.[name]
          ?? null
        );
      }

      const mismatches = [];
      for (const p of paths) {
        let json;
        try {
          json = JSON.parse(fs.readFileSync(p, "utf8"));
        } catch {
          mismatches.push(`${p}:invalid-json`);
          continue;
        }

        const vitest = depVersion(json, "vitest");
        if (vitest && vitest !== target) mismatches.push(`${p}:vitest=${vitest}`);

        const cov = depVersion(json, "@vitest/coverage-v8");
        if (cov && cov !== target) mismatches.push(`${p}:@vitest/coverage-v8=${cov}`);
      }

      process.stdout.write(mismatches.join("\n"));
    ' "$TARGET_VITEST_VERSION"
)"

if [[ -n "$MISMATCHES" ]]; then
  echo "Found Vitest version mismatches:" >&2
  echo "$MISMATCHES" | head -n 50 >&2
  fail "Pin Vitest (and coverage provider) to ${TARGET_VITEST_VERSION} across workspaces."
fi

echo "OK: Workspace Vitest versions match."
