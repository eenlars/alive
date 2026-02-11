# Alive Web App

Next.js web interface for Alive multi-tenant platform.

**📚 [Full Documentation](../../docs/README.md)** - See project root for complete docs

## Quick Reference

This is the web application layer. For complete documentation:

- **Setup**: [docs/GETTING_STARTED.md](../../docs/GETTING_STARTED.md)
- **Architecture**: [docs/architecture/](../../docs/architecture/README.md)
- **Security**: [docs/security/](../../docs/security/README.md)
- **Testing**: [docs/testing/](../../docs/testing/README.md)

## Development

```bash
# From project root
bun run dev

# From this directory
bun run dev
```

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- TailwindCSS 4
- Claude Agent SDK 0.1.25

## Directory Structure

```
apps/web/
├── app/                  # Next.js App Router
│   ├── api/             # API routes
│   ├── chat/            # Chat UI
│   └── workspace/       # Workspace selection
├── features/            # Feature modules
├── lib/                 # Shared utilities
└── components/          # React components
```

## Testing

```bash
bun run test              # Unit tests
bun run test:e2e      # E2E tests
```

See [Testing Guide](../../docs/testing/README.md) for details.
