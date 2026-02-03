# Changelog

All notable changes to the Site Controller package will be documented in this file.

## [1.0.0] - 2025-11-20

### Added

#### Package Structure
- Initial package creation with TypeScript configuration
- Strict TypeScript settings with ESNext module resolution
- Build system using Bun + TypeScript compiler
- Package exports for ESM modules

#### Bash Scripts (9 scripts)
- `00-validate-dns.sh` - DNS validation with exit code 12 on failure
- `00-assign-port.sh` - Atomic port assignment from registry
- `01-ensure-user.sh` - Idempotent system user creation
- `02-setup-fs.sh` - Filesystem setup with legacy migration support
- `03-build-site.sh` - Site build with dependency installation
- `04-start-service.sh` - systemd service management
- `05-caddy-inject.sh` - Caddy configuration with flock
- `99-teardown.sh` - Rollback and cleanup operations
- `lib/common.sh` - Shared bash utility functions

#### TypeScript Implementation
- `orchestrator.ts` - Main SiteOrchestrator class with 7-phase deployment
- `config.ts` - Path constants and helper functions
- `types.ts` - TypeScript interfaces and types
- `executors/common.ts` - Script execution wrapper with error handling
- `executors/dns.ts` - DNS validation executor
- `executors/port.ts` - Port assignment executor
- `executors/system.ts` - User creation executor
- `executors/filesystem.ts` - Filesystem setup executor
- `executors/build.ts` - Build executor
- `executors/service.ts` - Service management executor
- `executors/caddy.ts` - Caddy configuration and teardown executors

#### Documentation
- `README.md` - Complete package documentation with examples
- `SUMMARY.md` - Implementation summary and architecture notes
- `CHANGELOG.md` - Version history (this file)
- `examples/deploy-example.ts` - Executable usage example

#### Testing
- `test/integration.test.ts` - Basic smoke tests for exports

### Features
- **Shell-Operator Pattern**: Clean separation between Node.js and Bash
- **Atomic Operations**: Each script is idempotent and restartable
- **Automatic Rollback**: Failed deployments trigger cleanup
- **Type Safety**: Full TypeScript support with strict mode
- **Process Isolation**: Sites run as dedicated system users
- **Zero-Downtime**: Caddy hot-reload for configuration changes
- **Error Codes**: Distinct exit codes for different failure modes
- **Logging**: Dual logging (bash stdout + TypeScript console)

### Security
- Workspace path validation
- Dedicated system users per site
- File permission management (750 directories)
- Flock for Caddyfile (prevents race conditions)
- Atomic writes for registry updates
- No shell injection vulnerabilities

### Performance
- Sequential execution with clear phases
- Minimal system calls
- Efficient file operations
- Fast deployment times

### Known Limitations
- Requires root privileges for system operations
- DNS validation requires `dig` command
- Assumes systemd-based systems
- Requires Bun runtime

### Migration Notes
- Extracted from monolithic `deploy-site-systemd.sh` (408 lines)
- Maintains compatibility with existing deployment infrastructure
- Supports migration from PM2 to systemd
- Handles legacy site locations (`/root/webalive/sites/*`)

## Future Roadmap

### Planned Features
- [ ] Database state tracking (Supabase integration)
- [ ] Webhook deployment triggers
- [ ] Multi-site batch deployments
- [ ] Dry-run mode
- [ ] Health monitoring post-deployment
- [ ] Automated PM2 to systemd migration tool
- [ ] CloudFlare API integration for DNS checks
- [ ] Deployment status WebSocket streaming

### Under Consideration
- [ ] Docker container support
- [ ] Kubernetes deployment option
- [ ] Blue-green deployment strategy
- [ ] A/B testing support
- [ ] Automatic SSL certificate management
- [ ] CDN integration (CloudFlare, Fastly)
- [ ] Monitoring integration (Prometheus, Grafana)

---

**Version Format**: [Major].[Minor].[Patch]
- **Major**: Breaking changes
- **Minor**: New features, backwards compatible
- **Patch**: Bug fixes, backwards compatible
