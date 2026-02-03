# Package Deprecation Checklist

Use this checklist when deprecating a package to ensure complete removal and prevent build failures.

## Pre-Deprecation

- [ ] **Document replacement**: Create migration guide showing old → new package/API
- [ ] **Announce deprecation**: Notify team of deprecation timeline
- [ ] **Identify all usage**: Run comprehensive grep for package name across entire codebase

## Code Migration

- [ ] **Update import statements**: Replace all `import from '@scope/old-pkg'` with new package
- [ ] **Update API calls**: Migrate function calls, class names, types
- [ ] **Update configuration**: Check all config files (tsconfig, package.json dependencies)
- [ ] **Update scripts**: Check all bash/node scripts in `scripts/` directory
  - [ ] `scripts/deployment/*.sh`
  - [ ] `scripts/utilities/*.sh`
  - [ ] `scripts/test-*.ts`
- [ ] **Update documentation**: Search docs/ for package references

## Build System Cleanup

- [ ] **Remove from turbo.json**: Remove any package-specific tasks
- [ ] **Remove from knip.json**: Delete workspace configuration entry
- [ ] **Update deployment scripts**: Remove build steps in `build-atomic.sh`
- [ ] **Remove from package.json**:
  - [ ] Root package.json scripts
  - [ ] Dependencies in consuming packages
  - [ ] Workspace-specific scripts

## Filesystem Cleanup

- [ ] **Remove package directory**: `rm -rf packages/deprecated-pkg`
- [ ] **Remove node_modules symlinks**: `rm node_modules/@scope/deprecated-pkg`
- [ ] **Check for circular symlinks**: `find packages -maxdepth 2 -type l`
- [ ] **Clean turbo cache**: `rm -rf .turbo node_modules/.cache`

## Validation

- [ ] **Run workspace validation**: `./scripts/validation/detect-workspace-issues.sh`
- [ ] **Verify no references remain**: `grep -r "deprecated-pkg"`
- [ ] **Build succeeds locally**: `bun run build`
- [ ] **Tests pass**: `bun run test`
- [ ] **Type check passes**: `bun run type-check`
- [ ] **Lint passes**: `bun run lint`

## Integration Testing

- [ ] **Test production build**: `make wash-skip`
- [ ] **Test site deployment**: Deploy test site with new package
- [ ] **Verify runtime behavior**: Ensure functionality unchanged
- [ ] **Check logs**: No warnings about missing packages

## Documentation

- [ ] **Create migration guide**: Add to `docs/migrations/`
- [ ] **Update architecture docs**: Remove deprecated package from diagrams/docs
- [ ] **Update CLAUDE.md**: Add to "Legacy (Deprecated)" section
- [ ] **Document in changelog**: Record deprecation and replacement

## Prevention

- [ ] **Add to deprecated list**: Update validation script's DEPRECATED_PACKAGES array
- [ ] **Create RCA document**: If this caused issues, document root cause analysis
- [ ] **Review process**: Update this checklist based on lessons learned

## Example: deploy-scripts → site-controller

**Completed**: 2025-11-21

### What was changed:
- `scripts/test-deployment.ts`: `deploySite()` → `SiteOrchestrator.deploy()`
- `package.json`: Updated deploy-site script
- `knip.json`: Removed workspace entry
- `scripts/deployment/build-atomic.sh`: Removed build steps + validation checks
- Removed `packages/deploy-scripts/` directory
- Removed circular symlinks in packages
- Removed broken node_modules symlinks

### Issues found:
- Circular symlinks: packages/* directories had self-referential symlinks
- Build script still referenced deprecated package
- Empty `packages/guides` directory without package.json

### Prevention added:
- Workspace validation script: `scripts/validation/detect-workspace-issues.sh`
- Pre-build validation step in deployment pipeline
- This checklist created

---

**Remember**: Incomplete deprecation = production build failures. Use this checklist every time.
