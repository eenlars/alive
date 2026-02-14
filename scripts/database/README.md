# Database Scripts

## Database Type Generation

Database types are now centrally managed in the `@webalive/database` package.

### Quick Usage

```bash
# Generate all database types
cd packages/database
bun run gen:types
```

### What it does

Generates TypeScript type definitions for all database schemas:
- `iam` schema → `IamDatabase`
- `app` schema → `AppDatabase`
- `lockbox` schema → `LockboxDatabase`
- `integrations` schema → `IntegrationsDatabase`
- `public` schema → `PublicDatabase`

### Using the Types

Import from the database package:
```typescript
import type {
  IamDatabase,
  AppDatabase,
  LockboxDatabase
} from '@webalive/database'

// Access specific tables
type User = IamDatabase["iam"]["Tables"]["users"]["Row"]
type Domain = AppDatabase["app"]["Tables"]["domains"]["Row"]
```

### Requirements

The script reads environment variables from `apps/web/.env`:
- `SUPABASE_PROJECT_ID` - Your Supabase project ID

### Files in this directory

- `cleanup-test-database.ts` - Clean up test data from database
- `superclean.ts` - Deep cleanup of test data
- `generate-preview-caddyfile.ts` - Generate Caddy configuration for preview domains
- `run-sql.sh` - Core SQL runner for staging/production targets
- `sql.sh` - Thin wrapper around `run-sql.sh` for shorter command usage

### Notes

- Types are generated in `packages/shared/src/database/`
- Generated files (*.generated.ts) are git-ignored
- The main export file provides clean imports for all schemas
