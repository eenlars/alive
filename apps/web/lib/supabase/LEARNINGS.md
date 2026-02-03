# Type Generation Improvements - Learnings

**Date**: 2025-11-14

## What Was Learned

From analyzing the advanced type generation script, we incorporated these best practices:

### 1. ✅ Multiple Schema Support

**Before**: Single schema, manual scripts
**After**: Automatic generation for all schemas (public, iam, etc.)

```typescript
const schemas = [
  { name: "public", filename: "public.types.ts" },
  { name: "iam", filename: "iam.types.ts" },
]
```

### 2. ✅ Cooldown Mechanism

**Why**: Avoid excessive API calls to Supabase
**How**: 2-hour cooldown using timestamp file

```typescript
const cooldownMs = 2 * 60 * 60 * 1000
const stampFile = resolve(tempDir, ".last-run")
```

**Bypass**: `bun run gen:db:force` clears `.tmp` directory

### 3. ✅ Graceful Fallback

**Before**: Script fails if CLI unavailable
**After**: Uses committed template types with warning

```typescript
const recoverableErrorPattern =
  /AccessDenied|EACCES|ConnectionRefused|.../i

if (recoverableErrorPattern.test(combinedOutput)) {
  // Use fallback template
  return schemaTemplates[schemaName]
}
```

### 4. ✅ Environment Detection

**Skips generation in**:
- CI builds (`CI=true`)
- Vercel builds (`VERCEL=true`)
- Manual skip (`SKIP_DB_TYPES_GENERATION=1`)

**Result**: Faster builds, uses committed types

### 5. ✅ Temp Directory Management

**Before**: Global cache pollution
**After**: Isolated `.tmp/supabase` directory

```typescript
const tempDir = resolve(import.meta.dir, "../.tmp/supabase")
env: {
  TMPDIR: tempDir,
  BUN_INSTALL_CACHE: tempDir,
  XDG_CACHE_HOME: tempDir,
}
```

### 6. ✅ CLI Detection

**Smart detection**:
1. Check `SUPABASE_CLI_PATH` env var
2. Use `Bun.which("supabase")` to find binary
3. Fallback to `bunx supabase@latest`

```typescript
const supabaseCliPath =
  env.SUPABASE_CLI_PATH ||
  Bun.which("supabase") ?? null

const command = supabaseCliPath ?? "bun"
const args = supabaseCliPath
  ? baseArgs
  : ["x", "supabase@latest", ...baseArgs]
```

### 7. ✅ Constants Export Fix

**Problem**: Supabase generates invalid TypeScript

```typescript
export const Constants = { ... }  // Can't be type-only import
```

**Solution**: Automatic fix during generation

```typescript
const fixed = stdout.replace(
  /export const Constants = \{/,
  "export type Constants = typeof _Constants\n\nconst _Constants = {"
)
```

### 8. ✅ Better Error Handling

**Graceful degradation**:
- Network errors → use templates
- Permission errors → use templates
- CLI missing → use templates
- Unknown errors → fail build

### 9. ✅ Structured Output

**Before**: Mixed filenames (`types.ts`, `iam-types.ts`)
**After**: Consistent naming (`public.types.ts`, `iam.types.ts`)

**Location**: `lib/supabase/*.types.ts`

### 10. ✅ Generation Metadata

Every generated file includes:

```typescript
// Auto-generated iam schema types
// Generated: 2025-11-14T13:10:52.874Z
// Run: bun run gen:db
// Project: YOUR_PROJECT_ID
```

## Key Takeaways

1. **User experience first**: Never fail builds due to type generation
2. **Performance**: Cooldown prevents unnecessary regeneration
3. **Reliability**: Fallback templates ensure types always exist
4. **Flexibility**: Works with/without CLI, auth, network
5. **Transparency**: Clear warnings when using templates

## Files Created

```
apps/web/
├── scripts/
│   └── generate-db-types-improved.ts    ✨ NEW: Advanced generator
├── lib/supabase/
│   ├── public.types.ts                  ✨ RENAMED: Was types.ts
│   ├── iam.types.ts                     ✨ RENAMED: Was iam-types.ts
│   ├── server.ts                        ✅ UPDATED: Uses public.types
│   ├── client.ts                        ✅ UPDATED: Uses public.types
│   ├── server-rls.ts                    ✅ UPDATED: Uses public.types
│   ├── iam.ts                           ✅ UPDATED: Uses iam.types
│   └── LEARNINGS.md                     ✨ NEW: This file
└── .tmp/
    └── supabase/
        └── .last-run                    ✨ NEW: Cooldown timestamp
```

## Commands

```bash
# Standard generation (respects cooldown)
bun run gen:db

# Force regeneration (bypasses cooldown)
bun run gen:db:force

# Skip generation entirely (CI/Vercel auto-detects)
SKIP_DB_TYPES_GENERATION=1 bun run gen:db
```

## Future Enhancements

Could add:
- [ ] Schema introspection API (no CLI required)
- [ ] PostgreSQL direct connection fallback
- [ ] Automatic schema change detection
- [ ] Parallel schema generation
- [ ] Type diff reporting

## References

- Original script inspiration: User-provided advanced generator
- Supabase CLI: https://supabase.com/docs/guides/cli
- TypeScript type generation: https://supabase.com/docs/guides/api/rest/generating-types
