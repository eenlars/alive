# Deployment

Environment management and deployment guides.

**⚠️ Production deployment restricted - contact devops.**

## Documentation Overview

| Document | Purpose |
|----------|---------|
| [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | Current (as-is) deployment architecture with known issues |
| [REFACTORING_PROBLEM_STATEMENT.md](./REFACTORING_PROBLEM_STATEMENT.md) | Complete analysis of deployment flow problems and state machines |
| [site-deployment-state-machine.md](./site-deployment-state-machine.md) | Detailed bash script state machine (194 states, 6 phases) |
| [site-deployment-architecture.md](./site-deployment-architecture.md) | End-to-end deployment architecture documentation |

**Note:** A refactoring is being planned to address architectural issues documented in REFACTORING_PROBLEM_STATEMENT.md.

## Environments

| Environment | Domain | Port | Command |
|-------------|--------|------|---------|
| Dev | `dev.terminal.goalive.nl` | 8997 | `make dev` |
| Staging | `staging.terminal.goalive.nl` | 8998 | `make staging` |

## Dev & Staging Commands

```bash
# Deploy staging
make staging                  # Full staging deployment

# Rebuild dev tools + restart
make dev                      # Rebuild tools + restart dev server

# Logs
make logs-staging            # View staging logs
make logs-dev                # View dev logs

# Status
make status                  # Show all environments
systemctl list-units 'claude-bridge*'  # List bridge services

# Rollback
make rollback                # Interactive rollback to previous build
```

## Site Deployment

Deploy individual websites (not Claude Bridge itself):

```bash
bun run deploy-site <domain.com>
```

This creates:
- Systemd service: `site@domain-com.service`
- Dedicated user: `site-domain-com`
- Workspace: `/srv/webalive/sites/domain.com/`
- User account: Created or linked in Supabase
- Port: Auto-assigned from registry

**Docs:** `packages/deploy-scripts/README.md`

## Common Tasks

### View Logs

```bash
# Staging
make logs-staging

# Dev
make logs-dev

# Specific site
journalctl -u site@example-com.service -n 50 -f
```

### Check Status

```bash
# All environments
make status

# Specific environment
systemctl status claude-bridge-staging

# Specific site
systemctl status site@example-com.service
```

### Restart Service

```bash
# Dev environment
systemctl restart claude-bridge-dev

# Staging environment
systemctl restart claude-bridge-staging

# Individual site
systemctl restart site@example-com.service
```

All services are managed by systemd.

## Troubleshooting

### Tests Failed

**Solution:**
```bash
bun run test                     # See failures
# Fix tests
make dev                     # Retry
```

### CSS Not Loading (404)

**Cause:** Dev assets not built

**Solution:**
```bash
make dev                     # Full rebuild
```

### Port Already in Use

**Cause:** Previous process didn't stop

**Solution:**
```bash
lsof -ti:8997 | xargs kill -9  # Kill process on port
make dev                        # Restart
```

## Current Architecture Issues

**⚠️ Known Problems** (documented in [REFACTORING_PROBLEM_STATEMENT.md](./REFACTORING_PROBLEM_STATEMENT.md)):

1. **Ordering Problem**: Infrastructure deployed BEFORE Supabase registration
   - If Supabase fails, infrastructure is orphaned (no rollback)
   - Leaves running services, consumed ports, created users

2. **Mixed Concerns**: Auth credentials passed through infrastructure layer but unused
   - TypeScript library requires `email` parameter but never uses it
   - Creates false dependency and confusing API

3. **Dual Implementation**: TypeScript library vs Bash script
   - Maintenance burden, feature parity issues
   - Bash script has 194 states across 6 phases (fully documented)

4. **Port Registry Divergence**: Two sources of truth
   - JSON file written during deploy, Supabase after
   - No sync mechanism if they diverge

5. **No Rollback**: Partial failures leave inconsistent state
   - Infrastructure may be deployed but Supabase registration failed
   - No cleanup mechanism

6. **Concurrent Conflicts**: Limited locking mechanisms
   - Caddy file locking only, no distributed locks
   - Potential race conditions on port assignment

See [REFACTORING_PROBLEM_STATEMENT.md](./REFACTORING_PROBLEM_STATEMENT.md) for complete analysis including:
- 3 complete state machines (API, TypeScript, Bash)
- Database schema details
- Interaction flows
- Solution space exploration

## See Also

- [Architecture](../architecture/README.md) - System design
- [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) - Current deployment architecture (as-is)
- [Security: systemd Hardening](../security/systemd-hardening.md) - Site security
- [Troubleshooting](../troubleshooting/README.md) - Common issues
