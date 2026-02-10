---
name: Roadmap & Issues
description: Manage GitHub issues, milestones, and the Alive Roadmap project board. View project state, create/update issues, assign milestones and labels.
---

# Roadmap & Issues

Manage the Alive project roadmap, issues, and milestones via the GitHub CLI.

## Project Details

- **Repo**: `eenlars/alive`
- **Project board**: #1 "Alive Roadmap" (owner: `eenlars`)
- **Project ID**: `PVT_kwHOAgKQf84BOvXp`

## Milestones

| Milestone | Number | Focus |
|-----------|--------|-------|
| v1: Core Platform | 1 | Auth, workspaces, AI chat, site deployment |
| v2: Agent Intelligence | 2 | Background agents, automations, supervisor, MCP |
| Cleanup & DevEx | 3 | Naming, config consolidation, tech debt |

## Custom Project Fields

| Field | Type | Options |
|-------|------|---------|
| Priority | Single select | P0 - Critical, P1 - High, P2 - Medium, P3 - Low |
| Category | Single select | Infrastructure, UX, AI/Agent, Database, Security, Frontend, DevEx |
| Effort | Single select | Small (< 1 day), Medium (1-3 days), Large (3+ days) |

## Common Operations

### View project state
```bash
# List all open issues
gh issue list --repo eenlars/alive --state open --limit 50

# List issues by milestone
gh issue list --repo eenlars/alive --milestone "v1: Core Platform"

# List project items with fields
gh project item-list 1 --owner eenlars --format json

# View milestones
gh api repos/eenlars/alive/milestones --jq '.[] | "\(.title): \(.open_issues) open, \(.closed_issues) closed"'
```

### Create an issue
```bash
gh issue create --repo eenlars/alive \
  --title "Short descriptive title" \
  --body "$(cat <<'EOF'
## Summary
What and why.

## Details
- Bullet points
- With context

## Acceptance Criteria
- [ ] Thing works
EOF
)" \
  --milestone "v1: Core Platform"
```

### Update an issue
```bash
# Add to milestone
gh issue edit <number> --repo eenlars/alive --milestone "v1: Core Platform"

# Add labels
gh issue edit <number> --repo eenlars/alive --add-label "bug,P1"

# Close with comment
gh issue close <number> --repo eenlars/alive --comment "Fixed in <commit>"
```

### Add issue to project board
```bash
gh project item-add 1 --owner eenlars --url "https://github.com/eenlars/alive/issues/<number>"
```

### Set project field on an item
```bash
# Get item ID first
gh project item-list 1 --owner eenlars --format json | jq '.items[] | select(.content.number == <issue_number>) | .id'

# Set priority (need field ID: PVTSSF_lAHOAgKQf84BOvXpzg9Wk4U)
gh project item-edit --project-id PVT_kwHOAgKQf84BOvXp --id <item_id> --field-id PVTSSF_lAHOAgKQf84BOvXpzg9Wk4U --single-select-option-id <option_id>
```

### Field IDs (for programmatic updates)

| Field | Field ID |
|-------|----------|
| Status | PVTSSF_lAHOAgKQf84BOvXpzg9Wkpg |
| Priority | PVTSSF_lAHOAgKQf84BOvXpzg9Wk4U |
| Category | PVTSSF_lAHOAgKQf84BOvXpzg9Wk6U |
| Effort | PVTSSF_lAHOAgKQf84BOvXpzg9Wk8A |

## Guidelines

- **Issue titles**: Short, imperative ("Add X", "Fix Y", not "Adding X" or "X is broken")
- **Always assign a milestone** when creating issues
- **Add to the project board** after creating
- **Link PRs to issues**: Use "Fixes #N" in PR descriptions
- **Close stale issues** rather than letting them pile up
- When asked about project state, give a concise summary grouped by milestone
