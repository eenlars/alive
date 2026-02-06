# Future Maintenance Hardening (Deployment Consolidation)

## Goal
- Make deployment configuration single-source and verifiable.
- Reduce duplicated constants (service names, ports, paths) across TS, Bash, Makefile, and docs.
- Keep deployment fast by avoiding repeated work between staging and production.

## Findings (Current Drift)

### 1) Service-name drift (alive vs claude-bridge)
- `packages/shared/src/environments.ts` uses `alive-*`.
- `scripts/deployment/lib/common.sh` still maps services to `claude-bridge-*`.
- `scripts/deployment/deploy-dev.sh`, `Makefile`, and several ops scripts still call `claude-bridge-*`.

Examples:
- `scripts/deployment/lib/common.sh`
- `scripts/deployment/deploy-dev.sh`
- `Makefile`
- `ops/scripts/pre-deployment-check.sh`
- `ops/scripts/safe-deploy.sh`

### 2) Path drift (`/var/lib/alive` vs `/var/lib/claude-stream`)
- `packages/shared/src/config.ts` still hardcodes `/var/lib/claude-stream/*`.
- setup/deploy scripts and server config examples use `/var/lib/alive/*`.

Examples:
- `packages/shared/src/config.ts`
- `scripts/setup/server-setup.ts`
- `ops/server-config.example.json`

### 3) Port duplication is widespread
- Hardcoded `8997`, `8998`, `9000` appear in scripts, docs, tests, caddy snippets, and make targets.
- This creates "change in one place, forget ten others" risk.

### 4) Contract exists but is not consistently consumed
- `packages/shared/environments.json` exists and is intended as a shell-readable contract.
- Multiple scripts still bypass it and hardcode ports/service names directly.

### 5) Deployment pipeline does repeated work
- Deploy flow still reruns expensive checks/build logic across environments.
- Promotion/zero-downtime exists, but is not yet a strict "build once, promote many" contract.

## Path Drift Deep Dive (Multi-Server + Supabase)

### What "path drift" means here
- The same logical artifact is referenced by multiple absolute paths in different layers.
- Example mismatch:
  - `packages/shared/src/config.ts` still points to `/var/lib/claude-stream/server-config.json`
  - `packages/site-controller/src/infra/generate-routing.ts` points to `/var/lib/alive/server-config.json`
  - `packages/site-controller/scripts/05-caddy-inject.sh` references `/var/lib/claude-bridge/server-config.json`

This is not just naming inconsistency. It creates runtime ambiguity about where "truth" lives for generated routing, service files, and registry data.

### Why this is high-risk in multi-server deployments
1. Different processes read different config roots.
   - One process writes generated files under `/var/lib/alive/generated`, another reads from `/var/lib/claude-stream/generated`.
   - Result: "successful generation" with stale runtime config still loaded by caddy/systemd.
2. Server identity and server-local paths are coupled incorrectly.
   - `serverId` is cluster-level identity (used to query domains by `server_id` in Supabase).
   - Filesystem paths are host-local reality.
   - When these concerns are mixed ad hoc, one server can accidentally use assumptions from another.
3. Operational commands target different unit names.
   - Deployment helpers still call `claude-bridge-*`, while generators produce `alive-*`.
   - Result: restart/status/health checks can pass against the wrong unit or fail despite healthy services.
4. Hardcoded fallback paths hide misconfiguration.
   - Multiple "try path A then path B" patterns can mask drift until a deploy/restart event.
   - Drift becomes a delayed production failure rather than an immediate validation error.

### Consolidation model (recommended)
Use a strict 3-layer contract with clear ownership:

1. Layer A: Repo deployment contract (shared, versioned)
   - File: `packages/shared/src/deployment-contract.ts` (generated JSON artifact for shell use).
   - Owns environment invariants:
     - env keys (`dev`, `staging`, `production`)
     - ports
     - service names
     - relative build/script paths
   - No host-specific absolute paths here.

2. Layer B: Server-local runtime config (per host)
   - File: `/var/lib/alive/server-config.json` only.
   - Owns server identity + local filesystem:
     - `serverId`
     - `paths.aliveRoot`, `paths.sitesRoot`, `generated.*`
     - shell routing details for that host
   - This is the only absolute-path source.

3. Layer C: Supabase control plane (shared across servers)
   - Owns fleet data, not host filesystem details:
     - `app.domains.server_id` assignment
     - domain metadata and routing ownership
   - Keep Supabase authoritative for "which server owns which domain".
   - Do not store host absolute paths in Supabase.

### Practical rule set
- All absolute paths must be derived from Layer B (`/var/lib/alive/server-config.json`).
- All env/service/port constants must come from Layer A.
- All domain-to-server routing must come from Layer C (Supabase).
- Any file using `/var/lib/claude-stream` or `/var/lib/claude-bridge` is drift and should fail CI once migration is complete.

### Multi-server behavior after consolidation
- Every server keeps its own `/var/lib/alive/server-config.json` with a unique `serverId`.
- Same repo code runs everywhere.
- Routing generation flow per server:
  1. Read local config (`serverId`, local paths)
  2. Query Supabase domains where `server_id = local serverId`
  3. Write generated outputs to local `generated.*` paths
  4. Reload local caddy/systemd units from Layer A names

This preserves multi-server flexibility while removing path ambiguity.

### Migration strategy with low risk
1. Introduce canonical path resolver in shared config.
   - Add one exported accessor for config path + generated path roots.
2. Replace direct literals in scripts/packages with resolver/contract lookups.
3. Add compatibility shim for one rollout window.
   - Optional symlink from old path to new path if needed.
4. Turn on drift gate in CI.
   - Fail on new references to legacy roots outside allowlist.
5. Remove compatibility shim after one stable deploy cycle.

## Scope for Next PRs

## PR 1: Deployment Contract V1 (No Behavior Change)
- Introduce one canonical deployment contract in TS:
  - `packages/shared/src/deployment-contract.ts`
- Fields per env: `serviceName`, `systemdUnit`, `port`, `healthUrl`, `buildDir`, `currentSymlink`, `envFile`, key runtime paths.
- Generate JSON artifact for shell consumers:
  - `packages/shared/deployment-contract.json`
- Add schema validation in generation step (fail fast).

Acceptance:
- Contract is generated from TS in build.
- No runtime behavior changes yet.

## PR 2: Consume Contract from Bash/Make (Primary Consolidation)
- Replace hardcoded `get_port` and `get_service` lookups with contract-driven reads.
- Add helper:
  - `scripts/deployment/lib/deploy-contract.sh`
  - Functions: `contract_get env key`, `contract_require env key`
- Update consumers:
  - `scripts/deployment/lib/common.sh`
  - `scripts/deployment/deploy-dev.sh`
  - `scripts/deployment/build-and-serve.sh`
  - `scripts/deployment/rollback.sh`
  - `Makefile` targets for status/logs/restart

Acceptance:
- Deploy scripts no longer hardcode env ports/services.
- `make status`, `make logs-*`, deploy scripts all resolve from contract.

Validation and rollback (required before merge):
- Pre-deployment checks:
  - Source contract helpers and verify reads for each env (`dev`, `staging`, `production`) return non-empty values.
  - Verify missing keys fail loudly (`contract_require`) with non-zero exit status.
- Acceptance commands:
  - `make status` returns service names/ports from contract values.
  - `make logs-dev` and `make logs-staging` resolve service names via contract, not literals.
  - `scripts/deployment/deploy-dev.sh` completes with contract-driven values.
- Migration safety checks:
  - `rg -n "get_port\\(|get_service\\(|8997|8998|9000|claude-bridge-" scripts/deployment Makefile`
  - Allowlist only source-of-truth files; fail PR if hardcoded values remain in active deploy paths.
- Rollback procedure:
  - Revert PR 2 commit(s) and redeploy previous scripts.
  - Restart affected services (`alive-dev`, `alive-staging`, `alive-production`, `alive-broker`).
  - Confirm `make status` and health checks match pre-change values.
- Final gate:
  - Run full static checks and deployment smoke checks before merge.

## PR 3: Naming and Path Convergence (alive-only)
- Standardize on `alive-*` for service naming and `/var/lib/alive/*` for config/runtime files.
- Remove remaining `claude-bridge-*` and `claude-stream` references from deployment/runtime code.
- Keep compatibility shim for one rollout (mandatory symlink/alias), then remove.

Acceptance:
- Zero `claude-bridge-*` service references in active deployment scripts.
- Zero `/var/lib/claude-stream/*` in runtime config code.

PR 3 execution runbook (required):
- Phase 3a: introduce new paths and shims
  - Create `/var/lib/alive/*` as canonical runtime root.
  - Add mandatory shims from legacy roots (`/var/lib/claude-stream/*`, `/var/lib/claude-bridge/*`) to `/var/lib/alive/*`.
  - Do not remove legacy roots in this phase.
- Phase 3b: switch all readers/writers to alive-only references
  - Update deployment scripts, service generators, and ops scripts to consume only `alive-*` units and `/var/lib/alive/*`.
  - Regenerate unit files and routing artifacts.
- Phase 3c: remove shims after validation window
  - Remove shims only after explicit removal criteria are met (below).

Systemd migration sequence:
1. Freeze deployments and capture current status (`make status`, `systemctl list-units | rg "alive|claude-bridge"`).
2. Install/generate new `alive-*` units and run `systemctl daemon-reload`.
3. Start new units in order with health checks after each step:
   - `alive-broker`
   - `alive-dev`, `alive-staging`, `alive-production`
   - reload `caddy`
4. Validate new units are healthy and serving expected endpoints.
5. Stop/disable legacy `claude-bridge-*` units only after alive units are healthy.
6. Remove legacy unit files after one full validation cycle.

Path migration verification before deleting legacy paths:
- `rg -n "/var/lib/(claude-stream|claude-bridge)" scripts packages ops docs`
- Verify all running units reference `/var/lib/alive/*` in environment/files.
- Confirm generated artifacts and server config are written/read from `/var/lib/alive/*`.

Restart order:
1. Unit/config generators
2. `alive-broker`
3. `alive-dev`, `alive-staging`, `alive-production`
4. `caddy` reload

Rollback plan:
- Re-enable and restart legacy `claude-bridge-*` units.
- Repoint shims to previous known-good paths if required.
- Revert PR 3 commit set and redeploy previous generation scripts.
- Validate health endpoints and `make status` return to pre-migration values.

Shim removal criteria (must all pass):
- Two consecutive successful deploy cycles (staging and production) using alive-only paths.
- No legacy path references in active deployment/runtime scripts.
- No runtime logs indicating reads from legacy roots for 7 days.

## PR 4: Fast Path Deployment Contract
- Enforce "build once, promote many":
  - Staging build produces immutable artifact + manifest (`commit`, `lock hash`, `artifact id`).
  - Production deploy promotes validated artifact only (no rebuild).
- Skip redundant checks in production when promoting same commit/artifact from staging.
- Persist deployment metadata:
  - `artifact id`, `source env`, `git sha`, `created at`.

Acceptance:
- Production deploy from staging artifact performs no rebuild.
- Deployment time drops significantly for prod promotion path.

## PR 5: Drift Guardrails in CI
- Add drift checker script:
  - `scripts/validation/check-deployment-drift.sh`
- Fail CI if hardcoded env constants appear outside allowlisted source-of-truth files.
  - Ports: `8997|8998|9000`
  - Service prefixes: `alive-`, `claude-bridge-`
  - Paths: `/var/lib/alive`, `/var/lib/claude-stream`
- Add unit tests ensuring TS contract and generated JSON stay in sync.

Acceptance:
- CI blocks new config drift.
- Future refactors only touch source-of-truth files.

## Suggested Rollout Order
1. PR 1 (contract file + generation).
2. PR 2 (consume contract in scripts/Makefile).
3. PR 3 (alive-only naming/path cleanup).
4. PR 4 (build/promotion speed path).
5. PR 5 (drift guardrails).

## Success Criteria
- One deployment contract drives TS + shell + Make.
- Deploy scripts contain zero duplicated env constants.
- Production deploy is promotion-first and measurably faster.
- CI prevents re-introducing hardcoded deployment values.
