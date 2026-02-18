# @webalive/env

Centralized environment variable validation for the Alive monorepo.

## Architecture

This package uses [`@t3-oss/env-nextjs`](https://env.t3.gg) to provide type-safe, validated environment variable access across the entire monorepo.

### File Structure

```
packages/env/src/
├── schema.ts    # Pure Zod schemas (safe to import anywhere)
├── server.ts    # Server-side validation (uses node:fs)
├── client.ts    # Client-side validation (no Node.js built-ins)
└── index.ts     # Re-exports schemas only
```

### Entry Points

- `@webalive/env/server` - Use in API routes, server components, server actions
- `@webalive/env/client` - Use in client components
- `@webalive/env` - Use for schema types only (no `env` object)

## Usage

### Server-side (API routes, server components)

```typescript
import { env, getAnthropicApiKey } from "@webalive/env/server"

const apiKey = getAnthropicApiKey()  // Handles ANTHROPIC_API_KEY or ANTH_API_SECRET
const supabaseUrl = env.SUPABASE_URL  // Type-safe, validated at build time
const claudeModel = env.CLAUDE_MODEL  // Has default value
```

### Client-side (client components)

```typescript
import { env } from "@webalive/env/client"

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Schema-only imports (tests, type generation)

```typescript
import { serverSchema, clientSchema } from "@webalive/env"
```

### Bad patterns

```typescript
// BAD: Don't import from base path when you need env object
import { env } from "@webalive/env"  // env is NOT exported from base path

// BAD: Don't use process.env directly
const apiKey = process.env.ANTHROPIC_API_KEY  // No validation, no types

// BAD: Don't import server in client components
import { env } from "@webalive/env/server"  // Will fail with node:fs error
```

## Environment Variables

### Required

**Anthropic API:**
- `ANTHROPIC_API_KEY` or `ANTH_API_SECRET` - Anthropic API key (sk-ant-...)
  - Optional in local development mode (`ALIVE_ENV=local`)

**Supabase:**
- `SUPABASE_URL` - Supabase project URL (must be HTTPS)
- `SUPABASE_ANON_KEY` - Supabase anonymous key (JWT format)
- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase URL for client
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public Supabase key for client

### Optional

**Bridge Configuration:**
- `WORKSPACE_BASE` - Base directory for workspaces (default: `/srv/webalive/sites`)
- `ALIVE_PASSCODE` - Optional passcode for alive access
- `ALIVE_ENV` - Environment: `local` | `dev` | `staging` | `production`
- `LOCAL_TEMPLATE_PATH` - Path to template for local development

**Claude Configuration:**
- `CLAUDE_MODEL` - Claude model to use (default: `claude-sonnet-4-6`)
- Note: `CLAUDE_MAX_TURNS` is not an env var - use `DEFAULTS.CLAUDE_MAX_TURNS` from `@webalive/shared`

**Integrations:**
- `GROQ_API_SECRET` - Groq API key
- `GITHUB_WEBHOOK_SECRET` - GitHub webhook secret
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key (server-only)

**Security:**
- `JWT_SECRET` - JWT signing secret
- `JWT_ES256_PRIVATE_KEY` - ES256 private key for JWT
- `INTERNAL_TOOLS_SECRET` - Internal tools authentication
- `IMAGES_SIGNATURE_SECRET` - Image signature validation

## Local Development

For local development without a real Anthropic API key:

```bash
# .env.local
ALIVE_ENV=local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

When `ALIVE_ENV=local`, the Anthropic API key requirement is bypassed and a mock key is used.

## Validation Behavior

### Build Time

When you run `bun build`, the package validates ALL environment variables:

```bash
# Missing required var
$ bun build
Invalid environment variables:
  SUPABASE_URL: Required
  SUPABASE_ANON_KEY: Required

# Build exits with error code 1
```

### Skip Validation

In CI/CD environments where you want to skip validation (e.g., for previews):

```bash
SKIP_ENV_VALIDATION=true bun build
```

## Adding New Variables

To add a new environment variable:

1. **Add to schema** (`src/schema.ts`):
```typescript
export const serverSchema = {
  // ... existing vars
  MY_NEW_VAR: z.string().optional(),
}

export const runtimeEnv = {
  // ... existing vars
  MY_NEW_VAR: process.env.MY_NEW_VAR,
}
```

2. **Add to `turbo.json`** (if it affects build output):
```json
{
  "tasks": {
    "build": {
      "env": ["MY_NEW_VAR"]
    }
  }
}
```

3. **Add to `.env.example`**:
```bash
# My new feature
MY_NEW_VAR=example_value
```

4. **Run validation** to verify sync:
```bash
bun run validate:turbo-env
```

### IMPORTANT: NEXT_PUBLIC_* Variables

**All `NEXT_PUBLIC_*` variables MUST be added to both:**
- `src/schema.ts` (`clientSchema`)
- `turbo.json` (`tasks.build.env`)

If a `NEXT_PUBLIC_*` var is in schema.ts but NOT in turbo.json, it won't be baked into the client bundle during build, causing silent failures at runtime.

**The validation script catches this:**
```bash
$ bun run validate:turbo-env
❌ Missing from turbo.json tasks.build.env:
   - NEXT_PUBLIC_MY_NEW_VAR

These NEXT_PUBLIC_* vars are defined in @webalive/env schema
but not in turbo.json, so they won't be baked into the client bundle.

Fix: Add them to turbo.json tasks.build.env array
```

This validation runs automatically as part of `bun run static-check` (which runs in pre-push hooks).

## Why Server/Client Separation?

**The Problem:**

Next.js 16 with Turbopack fails when server-only code (using `node:fs`) is imported into client components, even transitively:

```
Error: the chunking context (unknown) does not support external modules (request: node:fs)
```

**The Solution:**

- `server.ts` can safely use `node:fs` for dotenv loading
- `client.ts` has no Node.js built-ins
- `schema.ts` contains only pure Zod schemas
- `index.ts` exports only schemas (safe to import anywhere)

## Security

- **Server-only variables** cannot be imported in client code
- **Client variables** must be prefixed with `NEXT_PUBLIC_`
- **JWT tokens** are validated with format checks
- **HTTPS URLs** are enforced for Supabase
- **API keys** are validated with format checks (sk-ant-... prefix)

## Troubleshooting

**Q: Build fails with "Invalid environment variables"**

A: Check that all required variables are set in your `.env.local` file. See `.env.example` for a template.

**Q: Build fails with "node:fs" error**

A: You're importing `@webalive/env/server` in a client component. Use `@webalive/env/client` instead.

**Q: How do I use this in tests?**

A: Set `ALIVE_ENV=local` in your test environment, or use `SKIP_ENV_VALIDATION=true` for unit tests.

**Q: Can I access `process.env` directly?**

A: No. Always import from `@webalive/env/server` or `@webalive/env/client`. Direct `process.env` access bypasses validation and type safety.

## References

- [@t3-oss/env-nextjs Documentation](https://env.t3.gg)
- [Turborepo Environment Variables](https://turbo.build/repo/docs/handbook/environment-variables)
