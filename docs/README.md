# Alive Documentation

**Production-grade technical documentation for the Alive AI development platform.**

## Essential Reading (Start Here)

| Document | Purpose |
|----------|---------|
| [Getting Started](./GETTING_STARTED.md) | Local development setup, first steps |
| [Architecture](./architecture/README.md) | System design, core patterns, data flow |
| [Security](./security/README.md) | Authentication, workspace isolation, threat models |

## Development Reference

| Topic | Purpose |
|-------|---------|
| [Features](./features/README.md) | Current features, implementation status |
| [Testing](./testing/README.md) | Unit, integration, E2E testing patterns |
| [Guides](./guides/README.md) | Practical how-to guides (setup, migration, debugging) |
| [Database](./database/README.md) | Supabase schema, RLS, migrations |
| [Troubleshooting](./troubleshooting/README.md) | Common issues, solutions, error patterns |

## Operations & Deployment

| Topic | Purpose |
|-------|---------|
| [Deployment](./deployment/README.md) | Environment management, deployment procedures |
| [Integrations](./integrations/README.md) | External service setup (Supabase, OAuth) |
| [Operations](./operations/README.md) | Infrastructure, shell server, reverse proxy |

## Business & Strategy

| Document | Purpose |
|----------|---------|
| [Vision](./VISION.md) | Platform mission, long-term strategy |
| [Business](./business/README.md) | Market position, external feedback, growth |

## For AI Assistants

- **Primary guide**: `CLAUDE.md` in project root (core rules, architecture, testing)
- **Doc style**: [DOC_WRITING_GUIDE.md](./DOC_WRITING_GUIDE.md)
- **Before work**: Always check relevant docs before making changes
  - Security changes → [security/README.md](./security/README.md)
  - Testing work → [testing/README.md](./testing/README.md)
  - File operations → [security/workspace-tools.md](./security/workspace-tools.md)

## Archive

Historical documentation, completed work, and open investigations:

- **[archive/active/](./archive/active/)** - Open problems, planned features (PRs), work-in-progress
- **[archive/outdated/](./archive/outdated/)** - Postmortems, old reports, superseded analysis
- **[archive/reference/](./archive/reference/)** - Technical deep-dives (streaming, diagrams, error handling)
- **[archive/legacy/](./archive/legacy/)** - Pre-current-architecture docs (for historical context)

**Archive browsing tips:**
- Use `grep -r "topic"` to search across archive
- Start with README.md in each archive subfolder
- Check `archive/active/` for current blockers and planned work

---

**Last updated**: 2026-02-03 | **Maintainer**: Alive Team
