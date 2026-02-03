# @webalive/database

Type-safe database access for Claude Bridge with **Drizzle ORM** and **PostgreSQL**.

```
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                             │
│  ┌─────────┐  ┌─────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   iam   │  │   app   │  │ integrations │  │  lockbox  │ │
│  │─────────│  │─────────│  │──────────────│  │───────────│ │
│  │ users   │  │ domains │  │ providers    │  │ secrets   │ │
│  │ orgs    │  │ convos  │  │ tokens       │  │ keys      │ │
│  │ sessions│  │ messages│  │ policies     │  │           │ │
│  └─────────┘  └─────────┘  └──────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## First Time Setup

**New to Claude Bridge?** Follow the setup guide:

```bash
# Read the full setup instructions
cat docs/database/SETUP.md
```

Or run the interactive setup:

```bash
cd packages/database
export DATABASE_URL="postgresql://user:pass@localhost:5432/claude_bridge"
bun run db:setup
```

## Usage

### Drizzle ORM (Recommended)

```typescript
import { db, schema, eq } from '@webalive/database/drizzle'

// Query users
const users = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, 'user@example.com'))

// Insert with returning
const [newUser] = await db
  .insert(schema.users)
  .values({ email: 'new@example.com', displayName: 'New User' })
  .returning()

// Joins
const userOrgs = await db
  .select({ user: schema.users, org: schema.orgs })
  .from(schema.users)
  .innerJoin(schema.orgMemberships, eq(schema.users.userId, schema.orgMemberships.userId))
  .innerJoin(schema.orgs, eq(schema.orgMemberships.orgId, schema.orgs.orgId))
```

### Supabase Client (Legacy)

```typescript
import { createIamClient } from '@webalive/database'

const iam = createIamClient(supabaseUrl, supabaseKey)
const { data } = await iam.from('users').select('*')
```

## Scripts

| Command | What it does |
|---------|--------------|
| `bun run db:setup` | Interactive setup wizard |
| `bun run db:generate` | Generate SQL from schema changes |
| `bun run db:push` | Apply schema to database |
| `bun run db:studio` | Open visual database browser |
| `bun run db:pull` | Introspect existing DB → schema |

## Schemas

| Schema | Purpose | Key Tables |
|--------|---------|------------|
| **iam** | Identity & Access | `users`, `orgs`, `org_memberships`, `sessions` |
| **app** | Application Data | `domains`, `conversations`, `messages`, `automations` |
| **integrations** | OAuth | `providers`, `access_policies`, `user_tokens` |
| **lockbox** | Secrets | `user_secrets`, `secret_keys` |

## Package Exports

```typescript
// Drizzle ORM (recommended)
import { db, schema, eq, and, or } from '@webalive/database/drizzle'

// Schema definitions only
import * as schema from '@webalive/database/schema'

// Supabase types + client (legacy)
import { Database, createIamClient, createAppClient } from '@webalive/database'
```

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `SUPABASE_URL` | ○ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ○ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ○ | Supabase service role key |
| `LOCKBOX_MASTER_KEY` | ✓ | 32-byte hex key for encryption |

Generate `LOCKBOX_MASTER_KEY`:
```bash
openssl rand -hex 32
```

## Documentation

- **[Setup Guide](../../docs/database/SETUP.md)** — Complete first-time setup
- **[Architecture](../../docs/architecture/README.md)** — System design
- **[Security](../../docs/security/README.md)** — Best practices
