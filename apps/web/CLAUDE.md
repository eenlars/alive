# Claude Bridge Web - Development Notes

**⚠️ See [/CLAUDE.md](../../CLAUDE.md) for main AI assistant guidelines.**

This file contains web app-specific notes.

## Quick Links

- [Main CLAUDE.md](../../CLAUDE.md) - Primary AI guidelines
- [Architecture](../../docs/architecture/README.md) - System design
- [Security](../../docs/security/README.md) - Security patterns
- [Testing](../../docs/testing/README.md) - Testing guide

## Web App Patterns

### Route Structure

```
app/
├── api/                    # API routes (Next.js route handlers)
│   ├── claude/            # Claude SDK integration
│   ├── files/             # File operations
│   └── login/             # Authentication
├── chat/                  # Chat UI
└── workspace/             # Workspace selection
```

### State Management

Use Zustand with atomic selector pattern:

```typescript
// lib/stores/exampleStore.ts
"use client"

import { create } from 'zustand'

interface ExampleState {
  value: string
  actions: {
    setValue: (value: string) => void
  }
}

export const useExampleStore = create<ExampleState>((set) => ({
  value: '',
  actions: {
    setValue: (value) => set({ value })
  }
}))

// Atomic selectors
export const useValue = () => useExampleStore(s => s.value)
export const useExampleActions = () => useExampleStore(s => s.actions)
```

See [Zustand patterns guide](../../docs/guides/zustand-nextjs-ssr-patterns.md)

### Adding API Routes

1. Create in `app/api/[name]/route.ts`
2. Authenticate with `isWorkspaceAuthenticated()`
3. Validate workspace paths
4. Return proper status codes

Example:

```typescript
import { isWorkspaceAuthenticated } from '@/features/auth/lib/auth'

export async function POST(req: Request) {
  const { workspace } = await req.json()
  
  const isAuth = await isWorkspaceAuthenticated(workspace)
  if (!isAuth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // ... your logic
}
```

## See Main Documentation

All comprehensive docs are in `/docs` at project root. This file only contains web app-specific notes.
