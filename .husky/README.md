# Husky Git Hooks

This project uses [Husky v9](https://typicode.github.io/husky/) with [lint-staged](https://github.com/lint-staged/lint-staged) to manage Git hooks.

## Hooks

### Pre-Commit Hook

The `pre-commit` hook formats only the files you're committing:
- Uses `lint-staged` to format staged files only
- Runs Biome formatter on TypeScript, JavaScript, JSON, and Markdown files
- **Speed**: Instant (only touches staged files, not entire repo)

### Pre-Push Hook

The `pre-push` hook runs comprehensive quality checks before allowing a push:
- Type checking (`turbo run type-check`)
- Linting (`turbo run lint`)
- Format checking (`turbo run format`)
- Unit tests (`bun run unit`)
- **Speed**: 10-60 seconds (uses Turborepo caching)

To skip hooks (not recommended):
```bash
git commit --no-verify  # Skip pre-commit
git push --no-verify    # Skip pre-push
```

## Setup for GUI Git Clients

If you use a GUI Git client (SourceTree, Tower, VS Code Git, GitHub Desktop), you may encounter `bun: command not found` errors. This happens because GUI apps don't load your shell configuration (`.zshrc`, `.bashrc`).

### Fix: Configure Husky to Find Bun

Create a Husky init file that will be automatically sourced before every hook:

```bash
mkdir -p ~/.config/husky
```

Then create/edit `~/.config/husky/init.sh`:

```bash
# Add Bun to PATH for Husky hooks
export PATH="$HOME/.bun/bin:$PATH"
```

Save the file and restart your Git client. Husky will now find Bun in GUI applications.

## Manual Testing

Test the pre-push hook manually:
```bash
# Run the checks
make static-check

# Or directly
bun run static-check
```

## Turborepo Caching

The static checks use Turborepo's caching system:
- **Cache hit**: Instant success if no files changed
- **Cache miss**: Only checks affected packages

This keeps the pre-push hook fast even in a large monorepo.
