# Monorepo Structure (Apps, Packages, Turborepo Contract)

This repo is a Bun workspaces + Turborepo monorepo.

## Core Contract

### 1) `apps/` = deployable services

Anything under `apps/` is a service that can be deployed (systemd, Docker, etc).

Rules:
- Every app **must** have a `package.json` so Turborepo can run tasks consistently.
- Apps must not import from other apps (`apps/*` → `apps/*` is forbidden).
- Apps may depend on `packages/*` libraries.

### 2) `packages/` = reusable libraries

Anything under `packages/` is a library intended to be imported by apps and other packages.

Rules:
- Packages **must not** import from `apps/` (libraries stay app-agnostic).
- Packages may depend on other packages.

### 3) Script Contract (what Turbo runs)

For JS/TS workspaces, scripts follow this contract:
- `build`: produce build artifacts (usually `dist/`, Next output, etc)
- `dev`: start development mode (watch mode)
- `start`: start production server (apps only)
- `type-check`: check TypeScript types (no emit)
- `lint`: lint code (no auto-fix)
- `format`: format code (fix)
- `ci`: **check-only** formatting + linting (must not write files)
- `test`: run tests (if the workspace has tests)

For non-Node apps (Go/Python), scripts map to their equivalents:
- `type-check` / `ci` must be check-only and must not rewrite files
- `format` may rewrite (it is the "fix" command)

### 4) Turborepo expectations

Root-level commands should behave predictably:
- `turbo run type-check` runs in **all** workspaces (no silent skips due to script naming)
- `turbo run ci` does check-only lint/format validation
- `bun run static-check` must not rewrite files

### 5) Enforced by tooling (not review opinions)

The script contract is machine-enforced:
- `bun run check:workspace-contract` validates required scripts exist in each workspace.
- It rejects `scripts.ci` commands that rewrite files (`--write`, `--fix`, `gofmt -w`).
- `bun run static-check` includes this contract check.
- PR CI runs `bun run check:affected` to keep feedback loops short while still enforcing the contract.

## Naming

Internal workspace packages should use the `@webalive/*` scope unless there is a deliberate reason
to use another scope (e.g. `@alive-game/*`).
