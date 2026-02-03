# @webalive/site-controller

Production-ready site deployment orchestrator using the Shell-Operator Pattern.

## Overview

This package provides atomic, idempotent deployment of websites with:
- **Automatic rollback** on failure
- **Concurrent deployment safety** via file locking
- **Port management** with conflict detection
- **systemd process isolation** with dedicated users
- **DNS validation** with wildcard domain support
- **Caddy configuration** with atomic updates

## Architecture

**Shell-Operator Pattern**:
- **TypeScript** (orchestration, error handling, state management)
- **Bash** (OS operations, filesystem, permissions, systemd)

### Deployment Phases

1. **DNS Validation** - Verify domain points to server
2. **Port Assignment** - Allocate port from registry (3333-3999)
3. **User Creation** - Create dedicated system user
4. **Filesystem Setup** - Copy template, set ownership
5. **Site Build** - Run bun install and build
6. **Service Start** - Launch systemd service
7. **Caddy Configuration** - Update reverse proxy config

## Usage

### Basic Deployment

\`\`\`typescript
import { SiteOrchestrator } from '@webalive/site-controller'

const result = await SiteOrchestrator.deploy({
  domain: 'example.com',
  slug: 'example-com',
  templatePath: '/path/to/template',
  serverIp: 'YOUR_SERVER_IP',
  wildcardDomain: 'alive.best',
  rollbackOnFailure: true
})

if (result.success) {
  console.log(\`Deployed: \${result.domain} on port \${result.port}\`)
} else {
  console.error(\`Failed at phase: \${result.failedPhase}\`)
  console.error(\`Error: \${result.error}\`)
}
\`\`\`

### Teardown

\`\`\`typescript
await SiteOrchestrator.teardown('example.com', {
  removeUser: false,
  removeFiles: false,
  removePort: true  // Free up the port
})
\`\`\`

## Scripts

Atomic bash scripts in \`scripts/\`:

- \`00-validate-dns.sh\` - DNS verification
- \`00-assign-port.sh\` - Port allocation with locking
- \`01-ensure-user.sh\` - System user creation
- \`02-setup-fs.sh\` - Filesystem preparation
- \`03-build-site.sh\` - Bun install + build
- \`04-start-service.sh\` - systemd service start
- \`05-caddy-inject.sh\` - Caddy config update
- \`99-teardown.sh\` - Site removal
- \`lib/common.sh\` - Shared utilities

**Important**: All logging functions write to stderr to avoid interfering with script output.

## Development

\`\`\`bash
# Build TypeScript
bun run build

# Type check
bun run typecheck

# Run tests
bun run test
\`\`\`

## Migration from old deploy-scripts

The \`@alive-brug/deploy-scripts\` package has been deprecated. Use this package instead.

## License

MIT
