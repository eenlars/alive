# Documentation Writing Guide

Best practices for writing technical documentation in the WebAlive/Claude Bridge codebase.

## Core Principles

1. **Intelligence** - Assume technical competence. No hand-holding or over-explanation.
2. **Conciseness** - High information density. Every sentence adds value.
3. **Consolidation** - One source of truth per topic. Link, don't duplicate.
4. **Clarity** - Scannable structure with clear headings and code examples.
5. **Actionability** - Provide concrete examples and commands, not abstract theory.

## Document Structure

### Standard Template

```markdown
# [Topic Name]

[One-sentence description of what this is]

## Overview

[2-3 sentences: What problem does this solve? Why does it exist?]

**Key Features:**
- Feature 1 with brief context
- Feature 2 with brief context
- Feature 3 with brief context

## [Core Section 1]

[Content organized by user needs, not implementation details]

## [Core Section 2]

[Use tables for comparisons, code blocks for examples]

## See Also

- [Related Doc 1](./path.md) - Context
- [Related Doc 2](./path.md) - Context
```

### When to Create New Docs

**✅ CREATE when:**
- New architectural pattern introduced
- New package/module added
- Complex feature needs standalone explanation
- Troubleshooting guide for recurring issues

**❌ DON'T CREATE when:**
- Can add to existing doc as new section
- Single function/small feature (add to README)
- Temporary implementation notes (use comments or PR description)
- Work-in-progress (use `docs/currently-working-on-this/`)

## Writing Style

### Language Rules

1. **Use active voice**: "The system validates credentials" not "Credentials are validated"
2. **Use imperative for instructions**: "Run `bun run test`" not "You should run `bun run test`"
3. **Be precise**: "Fails silently" not "doesn't work properly"
4. **Avoid hedging**: "This causes X" not "This might potentially cause X"
5. **No fluff**: "Fast" not "lightning-fast", "Secure" not "military-grade secure"

### Code Examples

**Good:**
```typescript
// ✅ Atomic credit deduction
const { data } = await iam.rpc('deduct_credits', {
  p_org_id: orgId,
  p_amount: credits
})
```

**Bad:**
```typescript
// Here's an example of how you might want to consider
// implementing credit deduction in your code:
const result = await iam.rpc('deduct_credits', { ... })
```

### Headings

Use semantic heading hierarchy:

```markdown
# Document Title (H1) - Only once per file
## Main Section (H2)
### Subsection (H3)
#### Detail (H4) - Rare
```

**Good heading names:**
- "Authentication Flow" (specific)
- "Deployment Architecture" (specific)
- "Known Issues" (specific)

**Bad heading names:**
- "Overview" (vague - be more specific)
- "More Information" (vague)
- "Details" (vague)

## Organization Patterns

### By User Intent (Preferred)

```markdown
## Deploying a New Site
[Steps for deployment]

## Updating an Existing Site
[Steps for updates]

## Troubleshooting Deployments
[Common issues]
```

### By System Component (When Needed)

```markdown
## TypeScript Orchestration Layer
[Orchestration details]

## Bash Script Layer
[Script details]

## Database Layer
[Database details]
```

### Tables for Comparisons

**Use tables when:**
- Comparing options (Before/After, Option A vs B)
- Listing properties (File, Purpose, Status)
- Reference data (Command, Description, Example)

```markdown
| Environment | Port | Command |
|-------------|------|---------|
| Dev | 8997 | `make dev` |
| Staging | 8998 | `make staging` |
```

## Specific Document Types

### Architecture Docs

**Template:**
```markdown
# [Architecture Name]

[Problem this architecture solves]

## Core Concepts

| Concept | Description |
|---------|-------------|
| Concept 1 | Brief explanation |

## Design Pattern

[Code example or diagram]

## Implementation Files

| File | Purpose |
|------|---------|
| `path/to/file.ts` | What it does |

## See Also
```

### Feature Docs

**Template:**
```markdown
# [Feature Name]

**Status**: [Implemented/In Progress/Planned]

## Problem

[What problem does this solve?]

## Solution

[How it works - concise]

## Usage

[Code example or command]

## Configuration

[If applicable]

## See Also
```

### Troubleshooting Docs

**Template:**
```markdown
# [Issue Name]

**Symptom**: [Observable behavior]

**Cause**: [Root cause]

**Solution**:
\`\`\`bash
# Steps to fix
\`\`\`

**Prevention**: [How to avoid in future]
```

## Location Guidelines

### Primary Documentation (`/docs`)

```
/docs/
├── README.md                  # Navigation hub
├── GETTING_STARTED.md         # Quick start guide
├── architecture/              # System design patterns
├── security/                  # Security patterns
├── testing/                   # Testing approaches
├── features/                  # Feature documentation
├── deployment/                # Deployment guides
├── troubleshooting/           # Common issues
├── guides/                    # How-to guides
└── archive/                   # Historical docs
```

### Package Documentation

**Each package should have:**
- `README.md` - Installation, usage, API
- `CHANGELOG.md` (if published externally)
- `docs/` subdirectory (if complex)

### App-Specific Documentation

**Location**: `apps/[app-name]/CLAUDE.md`
**Content**: App-specific development notes, not full documentation
**Keep**: Minimal, link to main docs

## Maintenance

### When to Update

**Update immediately when:**
- API changes (breaking or significant)
- New patterns introduced
- Security changes
- Deployment process changes

**Update during cleanup when:**
- Minor bug fixes
- Refactoring (no external behavior change)
- Adding tests

### When to Archive

**Archive when:**
- Problem is permanently solved
- Implementation changed entirely
- Historical reference only (keep for learning)

**Location**: `/docs/archive/[topic-or-date]/`

### When to Delete

**Delete when:**
- Completely obsolete (old framework, removed feature)
- Duplicate of canonical doc
- Temporary notes (task completed, PR merged)

**Process**: Archive first, delete after 3+ months if truly unused

## Cross-References

### Internal Links

**Format**: `[Link Text](./relative/path.md)`

**Good:**
```markdown
See [Authentication](../security/authentication.md) for JWT details.
```

**Bad:**
```markdown
See the authentication documentation at /root/alive/docs/security/authentication.md
```

### External Links

**Include context:**
```markdown
[Next.js App Router Docs](https://nextjs.org/docs/app) - Routing patterns
```

Not:
```markdown
[Docs](https://nextjs.org/docs/app)
```

## Code in Documentation

### File References

**Use colon notation for line numbers:**

```markdown
The credit system is implemented in `apps/web/lib/credits/supabase-credits.ts:188-247`.
```

### Command Examples

**Show working directory context:**

```bash
# From project root
cd apps/web && bun run test

# From anywhere (absolute path)
bun /root/alive/apps/web/test
```

### Configuration Examples

**Include comments for non-obvious parts:**

```typescript
// Environment config (uses NODE_ENV to select)
const envConfig = config[process.env.NODE_ENV || 'development']

// Resolve relative paths against cwd
const workspace = envConfig.defaultCwd.startsWith('/')
  ? envConfig.defaultCwd
  : join(process.cwd(), envConfig.defaultCwd)
```

## AI Assistant Guidelines

When writing documentation as an AI assistant:

1. **Check existing docs first** - Update existing rather than create new
2. **Follow patterns** - Match style of surrounding docs
3. **Be specific** - Reference exact files, line numbers, commands
4. **Test commands** - Verify bash commands before documenting
5. **Link generously** - Connect related docs
6. **Ask when uncertain** - Don't guess at technical details

## Examples

### ✅ Good Documentation

```markdown
# Session Management

Session persistence allows conversations to resume after browser close.

## Implementation

**File**: `apps/web/app/api/claude/stream/route.ts:45-67`

Sessions are keyed by `${userId}::${workspace}::${conversationId}`:

\`\`\`typescript
const sessionKey = \`\${userId}::\${workspace}::\${conversationId}\`
const sessionId = await sessionStore.get(sessionKey)
\`\`\`

**Current limitation**: In-memory store, production needs Redis.

## See Also
- [Architecture: Session Management](../architecture/session-management.md)
- [Redis Package](../../packages/redis/README.md)
```

### ❌ Bad Documentation

```markdown
# Sessions

Sessions are a way to keep track of user conversations so that they can continue later.

## How It Works

The system uses a special key format that combines different pieces of information together to create a unique identifier for each session. This is really important because without it, users would lose their conversation history.

There's a session store that you can use to save and retrieve sessions. In the future, we might want to consider using a database for this.
```

## Checklist

Before committing documentation:

- [ ] One clear purpose per document
- [ ] Active voice, imperative instructions
- [ ] Code examples tested
- [ ] File paths verified
- [ ] Links work (relative paths)
- [ ] No duplication of existing docs
- [ ] Proper heading hierarchy (H1 → H2 → H3)
- [ ] Tables for structured data
- [ ] See Also section with context
- [ ] Updated parent README if new doc added
