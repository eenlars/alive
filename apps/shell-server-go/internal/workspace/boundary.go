package workspace

import (
	"os"
	"path/filepath"
	"strings"
)

// ValidateSiteWorkspaceBoundary ensures workspacePath stays inside sitesPath after symlink resolution.
func ValidateSiteWorkspaceBoundary(workspacePath, sitesPath string) error {
	realSites, err := resolveRealPathOrAbs(sitesPath)
	if err != nil {
		return &PathSecurityError{Op: "resolve_sites_root", Path: sitesPath, Wrapped: ErrInvalidPath}
	}

	realWorkspace, err := resolveRealPathOrAbs(workspacePath)
	if err != nil {
		return &PathSecurityError{Op: "resolve_workspace_path", Path: workspacePath, Wrapped: ErrInvalidPath}
	}

	if !isWithinBase(realWorkspace, realSites) {
		return &PathSecurityError{Op: "validate_sites_boundary", Path: workspacePath, Wrapped: ErrOutsideBoundary}
	}

	return nil
}

func resolveRealPathOrAbs(path string) (string, error) {
	realPath, err := filepath.EvalSymlinks(path)
	if err == nil {
		return realPath, nil
	}
	return filepath.Abs(path)
}

func isWithinBase(path, base string) bool {
	return strings.HasPrefix(path, base+string(os.PathSeparator)) || path == base
}
