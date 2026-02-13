# Incus Tenant Isolation — Research & Test Results

Date: 2026-02-10
Server: Server 2 (sonno.tech, 95.217.89.48) — Ubuntu 24.04, 128GB RAM, 12 cores

## Why Incus

We need per-tenant compute isolation. Current model uses Linux system users (weak: shared kernel, no resource limits, no network isolation, one bad `bun install` can crash the server).

Options evaluated:
- **Firecracker**: Wrong for long-lived workloads. Once RAM is allocated it's never returned to host. Disk space not reclaimable. Designed for ephemeral lambdas.
- **Cloud Hypervisor**: Good for long-lived VMs. No exec API — need SSH or vsock agent inside each VM. More complexity.
- **QEMU (via Proxmox/Hocus)**: Battle-tested but heavy. Proxmox requires OS replacement.
- **Docker + gVisor (webs-pep)**: Already built at `/root/a/webs-pep`. But it's a policy gate, not compute isolation. No exec, no file ops. Would need full rewrite to be useful.
- **Incus (LXC)**: `apt install incus` on existing Ubuntu. Zero downtime. Native exec (5ms). Direct rootfs access (1ms). API-first. Shared kernel (weaker isolation than VMs) but sufficient for paying customers running AI-generated code.
- **Kubernetes + Kata Containers (Netclode)**: Production-ready but requires K3s. Too much operational overhead for 2-server setup.

**Decision**: Incus. Install on existing servers, no new cost, migrate incrementally.

## Installation

```bash
apt-get install -y incus
# Version installed: 6.0.0 (from Ubuntu 24.04 repos)
```

### Preseed config used for testing

```yaml
networks:
- config:
    ipv4.address: 10.50.0.1/24
    ipv4.nat: "true"
    ipv6.address: none
  name: alivebr0
  type: bridge

storage_pools:
- config:
    source: /var/lib/incus/storage-pools/alive-test
  driver: dir
  name: alive-test

profiles:
- config:
    limits.cpu: "1"
    limits.memory: 512MB
    limits.processes: "200"
  devices:
    eth0:
      name: eth0
      network: alivebr0
      type: nic
    root:
      path: /
      pool: alive-test
      size: 2GB
      type: disk
  name: alive-tenant
```

## Critical Issue: Docker iptables conflict

**Problem**: Docker sets `FORWARD` chain policy to `DROP`. This blocks ALL Incus container traffic.

**Symptom**: Containers can ping the gateway (10.50.0.1) but can't reach the internet. DNS fails, apt fails, bun install fails.

**Fix**:
```bash
iptables -I FORWARD -i alivebr0 -j ACCEPT
iptables -I FORWARD -o alivebr0 -j ACCEPT
```

**TODO**: Make persistent. Docker restarts may re-add DROP policy. Need to add these rules to a systemd service or iptables-persistent.

## Critical Issue: Container networking (DHCP)

**Problem**: Containers don't automatically get an IPv4 address despite dnsmasq running on the bridge. systemd-networkd inside the container doesn't request DHCP.

**Current workaround**: Manual IP assignment inside container:
```bash
systemctl disable --now systemd-resolved
rm -f /etc/resolv.conf
echo "nameserver 8.8.8.8" > /etc/resolv.conf
ip addr add 10.50.0.X/24 dev eth0
ip route add default via 10.50.0.1
```

**TODO**: Fix properly. Options:
1. Use cloud-init to configure networking
2. Use `incus config set` with raw.lxc network config
3. Use a different base image that handles DHCP correctly
4. Bake networking into a custom image/profile

## Test Results

### Test 1: Bun in unprivileged container — PASS

Bun 1.3.9 installs and runs without any seccomp issues. `io_uring`, `clone3()`, all work. No custom seccomp profile needed.

```
bun install (small package): 339ms
bun install (1334 packages, full React template): 4.5s
bun -e "console.log('ok')": works
bun run dev (Vite): works
```

### Test 2: Exec latency

| Method | Latency |
|--------|---------|
| `incus exec -- cat file` | 35-41ms |
| Direct host read of rootfs | 1-2ms |
| `incus exec -- bun -e "..."` | 43-59ms |

**Conclusion**: Claude file tools (Read, Write, Edit, Glob, Grep) MUST use direct rootfs access, not incus exec. 35x faster. Reserve `incus exec` for commands only (bun install, bun run dev, etc).

### Test 3: Process kill — PARTIALLY WORKS

**Killing `incus exec` on host does NOT kill the process inside the container.** The exec wrapper dies but the spawned process keeps running as an orphan.

**Solution**: Track the PID inside the container and kill it explicitly:
```bash
# Get PID
incus exec container -- cat /tmp/agent.pid
# Kill it
incus exec container -- kill -TERM $PID
```

Or run a small supervisor daemon inside each container that accepts kill signals over a Unix socket.

**Impact on Alive**: `agent-child-runner.ts` currently does `child.kill("SIGTERM")` which won't work. Need to rework the cancel/cleanup flow.

### Test 4: Host rootfs access — WORKS

Path: `/var/lib/incus/storage-pools/{pool}/containers/{name}/rootfs/`

For our setup: `/var/lib/incus/storage-pools/alive-test/containers/{name}/rootfs/`

- Read from host: files are immediately visible inside container
- Write from host: files are immediately visible inside container
- Symlinks, permissions, all POSIX operations work

**Warning**: This path is an implementation detail of the `dir` storage backend. Different storage backends (btrfs, zfs, lvm) may have different paths. If we switch storage backends, this breaks.

**Mitigation**: Use `incus query /1.0/instances/{name}` to get the rootfs path programmatically, or use `incus file` API for a stable interface (but slower).

### Test 5: Resource limits

**CPU limits**: Applied via cgroup. `limits.cpu=1` restricts to 1 core.

**Memory limits**: `limits.memory=512MB` sets cgroup `memory.max=512000000`. Process gets throttled when approaching limit (peak observed: 485MB). Does not immediately OOM kill — slows down instead. To enforce hard kill, may need `memory.oom.group` tuning.

**Process limits**: `limits.processes=200` works. Fork bomb blocked with `Resource temporarily unavailable`. Confirmed: cannot exceed PID limit.

**Disk limits**: `size: 2GB` on root device. Not tested enforcement.

### Test 6: Network isolation between containers — FAILS (by default)

Containers on the same bridge CAN reach each other. Container 2 can ping and HTTP to container 1.

**Fix options**:
1. iptables rules to block inter-container traffic on the bridge
2. Separate bridge per tenant (overkill, doesn't scale)
3. Incus network ACLs (built-in feature, need to configure)
4. Security groups at the profile level

### Test 7: Port forwarding — WORKS

Two methods tested:
1. **Proxy device**: `incus config device add {name} web proxy listen=tcp:0.0.0.0:{hostPort} connect=tcp:127.0.0.1:{containerPort}` — 32ms latency from host
2. **Direct bridge IP**: `curl http://10.50.0.X:port` — 2ms latency

For Caddy routing, proxy device is simpler (Caddy stays at `reverse_proxy localhost:{port}`). Direct IP is faster but requires Caddy to know container IPs.

### Test 8: Full Alive workflow simulation

Template: Real Alive template (Vite + React + ShadCN + Tailwind + Hono, 1334 packages)

**Deployment**:
- rsync template to container rootfs (excluding node_modules): instant
- bun install inside container: 4.5s
- Vite dev server start: ~3s
- Total: ~10s

**Claude tool calls (8 operations — simulating "add a contact form")**:
All via direct rootfs access:
1. Read Index.tsx: 1ms
2. Read App.tsx: 2ms
3. Glob components: 2ms
4. Read button.tsx: 1ms
5. Grep form patterns: 2ms
6. Write ContactForm.tsx: 1ms
7. Edit Index.tsx: 2ms
8. Read back to verify: 2ms
**Total: 26ms for 8 tool calls**

Same operations via `incus exec`: ~320ms (8 × 40ms)

**Package install + restart**:
- `bun add react-icons`: 1.1s
- Kill + restart dev server: 2.2s
- Site back up: 200ms response time

**Memory**: 337MB with full template loaded and Vite running

## Density Estimates

| Per-container RAM | Containers on 128GB (with 20GB for platform) |
|-------------------|-----------------------------------------------|
| 337MB (full template + Vite) | ~320 |
| 150MB (idle, no Vite) | ~720 |
| 512MB (worst case with builds) | ~210 |

## Architecture: What Changes in Alive

### Abstraction layer

```typescript
interface TenantRuntime {
  create(domain: string, limits: ResourceLimits): Promise<TenantEnvironment>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  destroy(id: string): Promise<void>
  get(id: string): Promise<TenantEnvironment | null>
  list(): Promise<TenantEnvironment[]>
  exec(id: string, options: ExecOptions): Promise<ExecResult>
  execStream(id: string, options: ExecOptions): ReadableStream<Uint8Array>
  getFilesystemRoot(id: string): string
  restart(id: string): Promise<void>
  getLogs(id: string, lines?: number): Promise<string>
  getMetrics(id: string): Promise<ResourceMetrics>
}
```

Implement with Incus today. Swap to Cloud Hypervisor/microVMs later if needed.

### Files that change

**Must change (5-6 files)**:
- `apps/web/lib/workspace-execution/command-runner.ts` — `runAsWorkspaceUser()` becomes `runtime.exec()`
- `apps/web/lib/workspace-execution/agent-child-runner.ts` — `runAgentChild()` becomes `runtime.execStream()`
- `apps/web/lib/workspace-service-manager.ts` — systemctl calls become `runtime.restart()`
- `apps/web/lib/tenant-utils.ts` — `domainToServiceName()`, `restartSystemdService()` etc become runtime calls
- `packages/site-controller/src/orchestrator.ts` — 7-phase deploy becomes: create container, push template, install deps, start

**Stays the same**:
- `packages/shared/src/path-security.ts` — `isPathWithinWorkspace()` same logic, different base path
- `packages/tools/src/lib/workspace-validator.ts` — same
- Caddy config generation (proxy device keeps same host ports)
- All UI code
- All API routes (just call different backend)
- Session management
- Claude SDK integration
- SSE streaming

### File operations strategy

Claude tools (Read, Write, Edit, Glob, Grep) operate directly on host filesystem via rootfs path. No exec overhead. The path changes from:
```
/srv/webalive/sites/{domain}/user/
```
to:
```
/var/lib/incus/storage-pools/{pool}/containers/{id}/rootfs/srv/site/user/
```

`isPathWithinWorkspace()` validation stays the same, just update the base path constant.

### Port management

Current: manual port file registry (3333-3999)
New: Incus proxy devices, auto-assigned host ports

```bash
incus config device add {id} web proxy \
  listen=tcp:0.0.0.0:{hostPort} \
  connect=tcp:127.0.0.1:5173
```

Caddy config stays: `reverse_proxy localhost:{hostPort}`

## Live test instance

**Container**: tenant-demo (still running)
**URL**: https://incus-demo.sonno.tech
**Caddy config**: `/etc/caddy/sites/incus-demo.caddy`
**Proxy device**: host:13173 → container:5173
**Bridge**: alivebr0 (10.50.0.0/24)
**Container IP**: 10.50.0.10
**Rootfs**: `/var/lib/incus/storage-pools/alive-test/containers/tenant-demo/rootfs/`

## Open issues to resolve before production

1. **DHCP/networking automation** — containers need auto IP assignment, not manual
2. **Docker iptables conflict** — need persistent rules that survive Docker restarts
3. **Inter-container isolation** — need ACLs or iptables to block cross-tenant traffic
4. **Process kill flow** — rework agent-child-runner.ts to track PIDs inside containers
5. **Storage backend** — `dir` works but no snapshots/COW. Consider btrfs or zfs for dedup and snapshots (node_modules is 90% duplicate across tenants)
6. **Base image** — create a custom image with Bun pre-installed to skip install on every container creation
7. **Warm pool** — pre-create N containers for instant assignment on new signups
8. **Memory limit tuning** — current soft limits don't OOM kill, need to decide behavior
9. **Migration path** — how to move existing systemd tenants to containers incrementally
10. **iptables persistence** — bridge forwarding rules must survive reboots and Docker restarts

## Additional notes from research validation

### Storage backend: ZFS recommended over Btrfs over dir

Incus docs recommend ZFS as most reliable, Btrfs as second choice. Both support:
- **COW clones**: Create instances from images via snapshots/clones (fast provisioning)
- **Volume snapshots**: First-class snapshot/restore without CRIU
- **Dedup potential**: node_modules is ~90% identical across tenants

The `dir` backend we tested works but has no snapshots, no COW, and quotas only work if ext4/XFS project quotas are enabled at the filesystem level. For production, switch to ZFS or Btrfs.

### Network ACLs for inter-container isolation

Incus has built-in network ACLs that can:
1. **Deny east-west traffic** between tenants on the same bridge
2. **Egress filtering** — default-deny access to internal/private CIDRs, allow outbound to public internet
3. Applied per-network or per-instance

This is the correct fix for our open issue #3 (containers can reach each other). No need for manual iptables rules.

### Stateful snapshots: CRIU warning

- **Filesystem-only snapshots**: Reliable for both containers and VMs
- **Stateful snapshots** (process memory + TCP connections): Unreliable for containers due to CRIU limitations. VMs capture running state more reliably via QEMU.
- **Implication**: Don't rely on stateful container snapshots for migration. Use stop → snapshot → restore → start pattern instead.

### Prometheus metrics endpoint

Incus exposes `/1.0/metrics` — Prometheus-compatible per-container metrics (CPU, memory, disk, network). No custom monitoring needed. Covers our S6 requirement without building a bespoke metrics plane.

### Incremental migration via disk device bind-mounts

Existing tenant workspace paths (`/srv/webalive/sites/{domain}/`) can be attached into Incus containers as disk devices (bind-mount). This enables side-by-side migration:
1. Keep existing workspace on host filesystem
2. Bind-mount into container as disk device
3. Shift process execution from `runAsWorkspaceUser()` to `incus exec`
4. Path validation (`isPathWithinWorkspace()`) stays at application layer

For VM instances, host paths are shared via 9p or virtio-fs (higher latency than bind-mount).

## Rejected alternatives

### webs-pep (Rust, /root/a/webs-pep)
Built 3 months ago for Docker+gVisor. Has JWT auth, upload leases, tenant routing, seccomp. But: no exec into containers, no file push/pull, no dev server lifecycle. Would need full rewrite. Incus gives more out of the box. Service is stopped since 2025-11-14.

### Firecracker
No RAM reclamation for long-lived VMs. No exec API. AWS Lambda-oriented. Hocus project abandoned Firecracker for QEMU specifically because of this.

### Proxmox
Replaces the OS. Can't install on running production server without downtime. Uses LXC under the hood anyway. Good for future multi-server management but wrong for current phase.

### Kubernetes + Kata Containers
Too much operational overhead. K3s is simpler but still another system to manage. Maybe later if we go multi-server.

## Key insight

The hard part is not LXC vs microVM (similar APIs, swappable). The hard part is going from NO isolation boundary to ANY boundary. Do it now with 20 tenants, not later with 500.
