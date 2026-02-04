# Local Development Setup

This guide explains how to set up Claude Bridge for local development.

## Overview

When running Claude Bridge locally, you'll use a **test workspace** that stays on your machine only and never gets committed to git. This allows you to safely experiment with Claude without affecting production workspaces.

## Architecture

### Local Development Mode

```
ALIVE_ENV=local
├── Test User: workspace="test", passcode="test"
├── Workspace: .alive/template (local-only, gitignored)
└── Template Source: packages/template/user
```

### Directory Structure

```
alive/
├── .alive/                      # Local-only workspace (gitignored)
│   └── template/                # Your test workspace
├── packages/
│   └── template/
│       └── user/                # Seed template (committed to git)
└── apps/
    └── web/
        └── .env.local           # Local environment config
```

## Quick Start

### 1. Run Setup Script

From the monorepo root:

```bash
bun run setup
```

This will:
- Create the `.alive` directory (if it doesn't exist)
- Copy `packages/template/user` to `.alive/template` (if it doesn't exist)
- Set up your local development workspace

### 2. Configure Environment

Create or update `apps/web/.env.local`:

```bash
ALIVE_ENV=local
LOCAL_TEMPLATE_PATH=/absolute/path/to/alive/.alive/template
```

**Note**: Replace `/absolute/path/to/alive` with your actual monorepo root path.

The setup script will output the exact path you need to use.

### 3. Start Development Server

From the monorepo root:

```bash
bun run web
```

Or from `apps/web`:

```bash
bun run dev
```

### 4. Login with Test Credentials

Navigate to `http://localhost:8999` and log in:

- **Workspace**: `test`
- **Passcode**: `test`

## How It Works

### Test User (Local Only)

When `ALIVE_ENV=local`, the login endpoint (`apps/web/app/api/login/route.ts`) accepts:

```typescript
workspace: "test"
passcode: "test"
```

This bypasses domain password validation and sets a session cookie with value `test-user`.

### Workspace Resolution

The workspace resolver (`apps/web/app/features/claude/workspaceRetriever.ts`) checks:

1. **If `ALIVE_ENV=local`**: Use `LOCAL_TEMPLATE_PATH` environment variable
2. **If `terminal.*` hostname**: Use custom workspace from request body
3. **Otherwise**: Use domain-based workspace (production mode)

### Security

- **Test user only works when `ALIVE_ENV=local`** – production deploys won't have this flag
- **`.alive/` is gitignored** – your local workspace never gets committed
- **`LOCAL_TEMPLATE_PATH` must be absolute** – no monorepo path resolution issues

## Workspace Management

### Resetting Your Local Workspace

To start fresh:

```bash
rm -rf .alive/template
bun run setup
```

This will recreate the template from `packages/template/user`.

### Modifying the Seed Template

If you want to change what new local workspaces start with:

1. Edit files in `packages/template/user/`
2. Commit changes to git
3. Delete and recreate your local workspace:
   ```bash
   rm -rf .alive/template
   bun run setup
   ```

## Troubleshooting

### Error: "LOCAL_TEMPLATE_PATH environment variable required"

**Cause**: `ALIVE_ENV=local` is set but `LOCAL_TEMPLATE_PATH` is missing.

**Fix**: Run `bun run setup` and add the displayed `LOCAL_TEMPLATE_PATH` to `apps/web/.env.local`.

### Error: "Local template workspace does not exist"

**Cause**: The path in `LOCAL_TEMPLATE_PATH` doesn't exist.

**Fix**: Run `bun run setup` to create the workspace.

### Error: "LOCAL_TEMPLATE_PATH must be an absolute path"

**Cause**: The path is relative (e.g., `../../.alive/template`) instead of absolute.

**Fix**: Use the full absolute path shown by `bun run setup` (e.g., `/Users/you/alive/.alive/template`).

### Error: "LOCAL_TEMPLATE_PATH exists but is not a directory"

**Cause**: A file exists at the path instead of a directory.

**Fix**: Remove the file and run `bun run setup --force`.

### Changes not appearing

Make sure:
1. `ALIVE_ENV=local` is set in `.env.local`
2. `LOCAL_TEMPLATE_PATH` points to the correct absolute path
3. You're logged in with workspace `test` and passcode `test`
4. You've restarted the dev server after changing `.env.local`

### Setup script edge cases

**Force reset workspace**:
```bash
bun run setup --force
```

**Empty template directory**:
The script auto-detects and repopulates empty template directories.

**Permission errors**:
Ensure you have read/write access to the monorepo directory.

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ALIVE_ENV` | Yes | Enable local development mode | `local` |
| `LOCAL_TEMPLATE_PATH` | Yes | Absolute path to local workspace | `/Users/you/alive/.alive/template` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key | `sk-ant-...` |
| `ALIVE_PASSCODE` | No | Bridge passcode (any works if unset) | `your-password` |

## Production vs Development

| Aspect | Production | Local Development |
|--------|-----------|-------------------|
| Environment | `ALIVE_ENV` not set | `ALIVE_ENV=local` |
| Login | Domain passwords | `test`/`test` |
| Workspace | `/srv/webalive/sites/{domain}/user` | `.alive/template` |
| Git tracking | Workspaces not in repo | `.alive/` gitignored |


# Edge Case Handling Documentation

This document outlines all edge cases handled by the local development setup.

## Setup Script Edge Cases

### 1. **Wrong Directory**
**Scenario**: User runs `bun run setup` from outside the project.

**Detection**: Check for `package.json` with name `"alive-mono"`.

**Behavior**: Error and exit with clear message.

### 2. **Missing Source Template**
**Scenario**: `packages/template/user` doesn't exist.

**Detection**: Check if path exists using `[ ! -e "$SOURCE_TEMPLATE" ]`.

**Behavior**: Error with message about incorrect monorepo structure.

### 3. **Source Template is a File**
**Scenario**: `packages/template/user` exists but is a file, not a directory.

**Detection**: Check with `[ ! -d "$SOURCE_TEMPLATE" ]`.

**Behavior**: Error asking user to fix repository structure.

### 4. **Empty Source Template**
**Scenario**: `packages/template/user` exists but contains no files.

**Detection**: Check with `[ -z "$(ls -A "$SOURCE_TEMPLATE" 2>/dev/null)" ]`.

**Behavior**: Error stating template must contain files.

### 5. **Source Template Not Readable**
**Scenario**: Permission issues prevent reading source template.

**Detection**: Check with `[ ! -r "$SOURCE_TEMPLATE" ]`.

**Behavior**: Error asking user to check permissions.

### 6. **.alive Exists as File**
**Scenario**: `.alive` exists but is a file instead of directory.

**Detection**: Check with `[ -e "$ALIVE_DIR" ] && [ ! -d "$ALIVE_DIR" ]`.

**Behavior**: Error with instructions to remove the file manually.

### 7. **Cannot Create .alive Directory**
**Scenario**: Write permissions prevent creating `.alive`.

**Detection**: Check exit code of `mkdir -p "$ALIVE_DIR"`.

**Behavior**: Error about write permissions.

### 8. **template Exists as File**
**Scenario**: `.alive/template` exists but is a file, not directory.

**Detection**: Check with `[ -e "$TEMPLATE_DIR" ] && [ ! -d "$TEMPLATE_DIR" ]`.

**Behavior**: Error with removal instructions.

### 9. **Empty Template Directory**
**Scenario**: `.alive/template` exists but is empty (corrupted).

**Detection**: Check with `[ -z "$(ls -A "$TEMPLATE_DIR" 2>/dev/null)" ]`.

**Behavior**: Auto-remove and repopulate.

### 10. **Template Already Exists (Normal)**
**Scenario**: User runs setup when template already exists.

**Detection**: Check with `[ -d "$TEMPLATE_DIR" ]` and not empty.

**Behavior**: Skip copy, show instructions for reset with `--force`.

### 11. **Force Flag**
**Scenario**: User runs `bun run setup --force` to reset workspace.

**Detection**: Parse `$1` argument for `--force` or `-f`.

**Behavior**: Remove existing template and recreate.

### 12. **Copy Failure**
**Scenario**: Disk full or permission issues during copy.

**Detection**: Check exit code of `cp -r` command.

**Behavior**: Error with disk space/permission message.

### 13. **Copy Verification Failure**
**Scenario**: Copy appears successful but result is empty.

**Detection**: Verify destination exists and is not empty after copy.

**Behavior**: Error about copy verification failure.

### 14. **.env.local Missing**
**Scenario**: First time setup, no `.env.local` file exists.

**Detection**: Check with `[ -f "$ENV_FILE" ]`.

**Behavior**: Show instructions to create file with required vars.

### 15. **.env.local Misconfigured**
**Scenario**: `.env.local` exists but missing or wrong vars.

**Detection**: Grep for exact `ALIVE_ENV=local` and correct `LOCAL_TEMPLATE_PATH`.

**Behavior**: Show update instructions with correct values.

### 16. **.env.local Correctly Configured**
**Scenario**: Everything is already set up correctly.

**Detection**: Both vars present and correct in `.env.local`.

**Behavior**: Simplified "next steps" without env config.

## Runtime (workspaceRetriever.ts) Edge Cases

### 1. **ALIVE_ENV=local but No LOCAL_TEMPLATE_PATH**
**Scenario**: Environment flag set but path not provided.

**Detection**: Check `!templateWorkspace` after reading env var.

**Response**: 500 error with suggestion to run setup script.

### 2. **Relative Path in LOCAL_TEMPLATE_PATH**
**Scenario**: User provides `../../.alive/template` instead of absolute path.

**Detection**: Check with `!path.isAbsolute(templateWorkspace)`.

**Response**: 500 error explaining absolute paths required.

### 3. **LOCAL_TEMPLATE_PATH Doesn't Exist**
**Scenario**: Path was deleted after configuration.

**Detection**: Check with `!existsSync(templateWorkspace)`.

**Response**: 404 error with suggestion to run setup script.

### 4. **LOCAL_TEMPLATE_PATH is a File**
**Scenario**: A file exists at the path instead of directory.

**Detection**: Check with `statSync().isDirectory()` returning false.

**Response**: 500 error with removal + setup instructions.

### 5. **Cannot Stat LOCAL_TEMPLATE_PATH**
**Scenario**: Permission issues or filesystem errors.

**Detection**: Catch exception from `statSync()`.

**Response**: 500 error with permission check suggestion.

### 6. **Wrong Hostname in Terminal Mode**
**Scenario**: `terminal.*` hostname with invalid workspace param.

**Detection**: Existing validation in `getTerminalWorkspace()`.

**Response**: 400 error with clear param requirements.

### 7. **Production Mode (No ALIVE_ENV)**
**Scenario**: Normal production operation.

**Detection**: `process.env.ALIVE_ENV !== "local"`.

**Behavior**: Use normal workspace resolution (domain-based).

## User Workflow Edge Cases

### Multiple Clones
**Scenario**: User has multiple clones of the repo.

**Handling**: Each clone gets its own `.alive/` directory (gitignored). `.env.local` must point to correct clone's `.alive/template`.

### Template Updates
**Scenario**: `packages/template/user` is updated after `.alive/template` created.

**Handling**: User must manually reset: `bun run setup --force`.

### Concurrent Setup
**Scenario**: Multiple terminals run `bun run setup` simultaneously.

**Handling**: File system operations are atomic enough; worst case is redundant copy.

### Workspace in Use During Reset
**Scenario**: Dev server running while user runs `bun run setup --force`.

**Handling**: Files may be locked or in use. User should stop dev server first.

### Symlink Edge Cases
**Scenario**: Source template or destination contains symlinks.

**Handling**: `cp -r` preserves symlinks by default, which works correctly.

## Security Considerations

### Path Traversal
**Prevention**:
- Absolute path validation prevents `../` attacks
- `path.normalize()` used in terminal mode
- Boundary checks ensure paths stay within workspace

### Arbitrary File Access
**Prevention**:
- Local mode only works when `ALIVE_ENV=local` (won't be set in production)
- Test credentials only work in local mode
- `.alive/` is gitignored (never deployed)

### Environment Variable Injection
**Prevention**:
- Path validated as absolute before use
- Directory existence + type checked
- No shell evaluation of env var values

## Testing Checklist

- [ ] Run setup on fresh clone
- [ ] Run setup when template exists (should skip)
- [ ] Run setup --force (should replace)
- [ ] Test with missing source template
- [ ] Test with .alive as file instead of directory
- [ ] Test with template as file instead of directory
- [ ] Test with empty template directory
- [ ] Test .env.local detection (missing, misconfigured, correct)
- [ ] Test runtime with missing LOCAL_TEMPLATE_PATH
- [ ] Test runtime with relative path
- [ ] Test runtime with non-existent path
- [ ] Test runtime with file instead of directory
- [ ] Verify .alive/ is gitignored
- [ ] Verify test credentials only work when ALIVE_ENV=local

