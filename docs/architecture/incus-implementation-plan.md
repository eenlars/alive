# Incus Container Tenant Isolation — Implementation Plan

Date: 2026-02-10
Prereq: [Research & Test Results](./incus-tenant-isolation.md)

## Goal

Deploy one real tenant into an Incus container through the Alive deploy flow. End-to-end: chat with Claude, file operations via rootfs, dev server accessible via browser.

## Key Decisions

1. **Agent stays on host** — Claude SDK runs on host. File tools use direct rootfs access (1ms). Commands use `incus exec` (35-41ms).
2. **No privilege drop for container workspaces** — security shifts from UID-based to path-validation + container boundary.
3. **Filesystem-based detection** — `resolveWorkspace()` tries systemd path first, falls back to container rootfs. No DB schema changes.
4. **Opt-in via `server-config.json`** — `incus.enabled: true` activates container paths. Existing tenants unaffected.
5. **CLI for exec, REST API for lifecycle** — `incus exec` for commands, HTTP-over-Unix-socket for create/start/stop/delete/devices.

## New Package: `packages/tenant-runtime/`

```
packages/tenant-runtime/
  package.json
  tsconfig.json
  src/
    index.ts            — public exports
    types.ts            — TenantRuntime interface, TenantEnvironment, ExecResult
    incus-client.ts     — HTTP client (node:http over Unix socket) + CLI exec wrapper
    incus-runtime.ts    — IncusTenantRuntime implements TenantRuntime
    container-naming.ts — slug <-> container name helpers
    errors.ts           — IncusError class
    guards.ts           — assertServerOnly
```

### TenantRuntime interface

```typescript
interface TenantRuntime {
  create(tenantId: string, options: CreateOptions): Promise<TenantEnvironment>
  start(tenantId: string): Promise<void>
  stop(tenantId: string): Promise<void>
  destroy(tenantId: string): Promise<void>
  get(tenantId: string): Promise<TenantEnvironment | null>
  list(): Promise<TenantEnvironment[]>
  exec(tenantId: string, options: ExecOptions): Promise<ExecResult>
  getFilesystemRoot(tenantId: string): string
  addProxyDevice(tenantId: string, hostPort: number, containerPort: number): Promise<void>
  removeProxyDevice(tenantId: string): Promise<void>
}
```

### Incus client

- `node:http` with `socketPath: /var/lib/incus/unix.socket` for lifecycle (create, start, stop, delete, devices)
- `node:child_process.execFile("incus", ["exec", ...])` for command execution
- Polls `/1.0/operations/{uuid}/wait` for async operations

## Steps

### 1. Create `packages/tenant-runtime/`

Package structure, types, Incus client, runtime implementation. Depends on `@webalive/shared`.

### 2. Create base image

Container with Bun pre-installed + networking configured. Publish as `alive-base` image. Avoids installing Bun on every `create()`.

### 3. Add INCUS config to `packages/shared/src/config.ts`

```typescript
// ServerConfigFile addition
incus?: {
  enabled?: boolean        // default false
  socketPath?: string      // default /var/lib/incus/unix.socket
  storagePool?: string     // default "alive-test"
  profile?: string         // default "alive-tenant"
  bridge?: string          // default "alivebr0"
}

// New export
export const INCUS = { ENABLED, SOCKET_PATH, STORAGE_POOL, PROFILE, BRIDGE }

// SECURITY.ALLOWED_WORKSPACE_BASES — add container rootfs base when enabled
```

### 4. Update `server-config.json`

Add `incus.enabled: true` on this server.

### 5. Container helpers for workspace execution

New file `apps/web/lib/workspace-execution/container-utils.ts`:
- `isContainerWorkspace(path)` — path under Incus storage pool?
- `extractContainerName(path)` — container name from rootfs path
- `rootfsPathToContainerPath(path)` — strip host prefix, get container-internal path

Modify `command-runner.ts`:
- Add `runInContainer()` — wraps `incus exec {container} --cwd {path} -- {cmd}`
- `runAsWorkspaceUser()` delegates to `runInContainer()` when workspace is container-backed

### 6. Update workspace resolution

`workspace-secure.ts` — `resolveWorkspace()`:
- Try systemd path first (existing)
- Fallback: container rootfs path (`/var/lib/incus/storage-pools/{pool}/containers/tenant-{slug}/rootfs/srv/site/user/src`)

`getWorkspace()`:
- Container workspaces return `uid: 0, gid: 0` (agent runs as root on host)

### 7. Update agent-child-runner + run-agent.mjs

`agent-child-runner.ts`:
- Container workspace → `uid=0, gid=0`, pass `CONTAINER_NAME` env var
- `shouldUseChildProcess()` returns true for container workspaces

`run-agent.mjs`:
- If `CONTAINER_NAME` set, skip privilege drop
- File tools work automatically (rootfs is `process.cwd()`)

### 8. Container deploy path in site-controller

Add `runtime?: "systemd" | "container"` to `DeployConfig` (default: `"systemd"`).

`deployContainer()` in `SiteOrchestrator`:
1. DNS validation (same)
2. Port assignment (same)
3. Create container (replaces user creation) — from `alive-base` image + `alive-tenant` profile, rsync template into rootfs
4. Build inside container — `runtime.exec("bun", ["install"])`
5. Start + proxy device (replaces systemd start)
6. Caddy config (same — `reverse_proxy localhost:{hostPort}`)

Rollback: `runtime.destroy()` removes everything.

### 9. Update workspace-service-manager

Container-aware restart/status/logs. Detect via `incus info tenant-{slug}`.

### 10. End-to-end validation

Deploy → chat → file ops → dev server → restart. Verify existing systemd tenants unaffected.

## Files Changed

| File | Change |
|------|--------|
| `packages/tenant-runtime/` (new) | Entire package |
| `packages/shared/src/config.ts` | INCUS config, ALLOWED_WORKSPACE_BASES |
| `apps/web/lib/workspace-execution/container-utils.ts` (new) | Detection helpers |
| `apps/web/lib/workspace-execution/command-runner.ts` | `runInContainer()`, container delegation |
| `apps/web/lib/workspace-execution/agent-child-runner.ts` | Container-aware privilege handling |
| `apps/web/scripts/run-agent.mjs` | Skip privilege drop for containers |
| `apps/web/features/workspace/lib/workspace-secure.ts` | Container rootfs fallback |
| `apps/web/lib/workspace-service-manager.ts` | Container-aware restart/status/logs |
| `packages/site-controller/src/orchestrator.ts` | `deployContainer()`, `runtime` option |
| `packages/site-controller/src/types.ts` | `runtime` field |
| Server: `server-config.json` | `incus` section |

## What stays the same

- All UI code
- All API routes
- Caddy config generation
- Session management
- Claude SDK integration
- Path security logic (`isPathWithinWorkspace()`)
- Superadmin workspace
- Existing systemd tenants
