# Environment Configuration

**Single source of truth: `packages/shared/src/environments.ts`**

All environment definitions (ports, process names, domains, etc.) are defined in ONE place. Other files read from it.

## File Architecture (DRY)

| File | Purpose | Source |
|------|---------|--------|
| **`packages/shared/src/environments.ts`** | **SINGLE SOURCE OF TRUTH** - TypeScript config | Primary definition |
| `packages/shared/environments.json` | Generated JSON for bash scripts | Generated from TypeScript via `bun run generate-json` |
| Scripts (`*.sh`) | Bash scripts read with `jq` | packages/shared/environments.json (generated) |

### One file, two interfaces
- **JSON**: Raw configuration (simple, universal)
- **TypeScript**: Type-safe with validation and helper functions
- **Bash**: Read directly with `jq` (see examples below)

All data defined in TypeScript, JSON generated for bash = **True DRY principle**

## Adding a New Environment

**Only ONE place to update: `packages/shared/src/environments.ts`**

### 1. Edit `packages/shared/src/environments.ts`

```typescript
export const environments: Record<EnvironmentKey, Environment> = {
  production: { ... },
  dev: { ... },
  staging: {
    key: "staging",
    displayName: "Staging",
    prefix: "staging",
    port: 8997,
    domain: "your-staging-domain.goalive.nl",
    processName: "alive-staging",
    serverScript: "node_modules/.bin/next",
    workspacePath: "/srv/webalive/sites",
    isProduction: false,
    hasHotReload: true,
    deployCommand: "make staging",
    logsCommand: "make logs-staging",
    restartCommand: "pm2 restart alive-staging"
  }
}
```

### 2. Update TypeScript type (optional)

If using TypeScript, update the `EnvironmentKey` type in `packages/shared/src/environments.ts`:

```typescript
export type EnvironmentKey = 'production' | 'dev' | 'staging'
```

### 3. Regenerate JSON for bash scripts

```bash
cd packages/shared && bun run generate-json
```

That's it! TypeScript code imports directly, bash scripts use the generated JSON.

## Using the Configuration

### TypeScript/JavaScript

```typescript
import { environments, getEnvironment, getEnvironmentByPort } from '@webalive/shared/environments'

// Get by key
const devEnv = environments.dev
console.log(devEnv.port)        // 8997
console.log(devEnv.processName) // alive-dev

// Helper functions
const env = getEnvironment('production')
const byPort = getEnvironmentByPort(8999)
const byProcess = getEnvironmentByProcessName('alive')
```

### Bash Scripts

```bash
#!/bin/bash
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_CONFIG="$PROJECT_ROOT/packages/shared/environments.json"

# Read values directly with jq
DEV_PORT=$(jq -r '.environments.dev.port' "$ENV_CONFIG")
PROD_PROCESS=$(jq -r '.environments.production.processName' "$ENV_CONFIG")

# Use in commands
echo "Dev port: $DEV_PORT"
echo "Prod process: $PROD_PROCESS"
pm2 logs "$(jq -r '.environments.dev.processName' "$ENV_CONFIG")" --lines 1000
```

### Node.js (CommonJS)

```javascript
const config = require('./bridge.config.js')
console.log(config.ports.dev)     // 8998
console.log(config.appName.prod)  // alive
```

## Validation

Both configs include validation to prevent:
- Duplicate ports
- Duplicate process names
- Invalid port ranges (1024-65535)
- Missing production environment

## When to Update

Update these files when:
- Adding a new environment
- Changing a port
- Renaming a process
- Changing a domain
- Adding environment-specific properties

**Do NOT hardcode** port numbers, process names, or domains elsewhere. Always reference the config.

## Migration Guide: Staging → Dev Rename

Example of how the "staging" environment was renamed to "dev":

**Before:**
```
packages/shared/src/environments.ts:
  staging: { port: 8998, processName: 'alive-staging', ... }

scripts/*.sh:
  pm2 logs alive-staging
  pm2 restart alive-staging
```

**After:**
```
packages/shared/src/environments.ts:
  dev: { port: 8997, processName: 'alive-dev', ... }

scripts/*.sh:
  DEV_PROCESS=$(jq -r '.environments.dev.processName' "$ENV_CONFIG")
  pm2 logs "$DEV_PROCESS"
```

## Benefits

1. **Single source of truth** - Change once, propagates everywhere
2. **Type-safe** - TypeScript catches errors at compile time
3. **Validated** - Prevents duplicate ports/names
4. **Documented** - All properties in one place
5. **Queryable** - Helper functions to find envs by port, name, domain
6. **Bash-friendly** - Scripts read directly with `jq` (standard JSON tool)
7. **Backward compatible** - Legacy code still works with bridge.config.js
