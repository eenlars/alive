package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"shell-server-go/internal/config"
)

// Path security errors
var (
	ErrPathTraversal   = errors.New("path traversal detected")
	ErrSymlinkEscape   = errors.New("symlink escape detected")
	ErrInvalidPath     = errors.New("invalid path")
	ErrOutsideBoundary = errors.New("path outside allowed boundary")
	ErrInvalidSiteName = errors.New("invalid site name")
	ErrRootDeletion    = errors.New("cannot delete root directory")
)

// PathSecurityError wraps path security errors with context
type PathSecurityError struct {
	Op      string // operation that failed
	Path    string // the problematic path
	Wrapped error  // underlying error
}

func (e *PathSecurityError) Error() string {
	return fmt.Sprintf("%s: %s: %v", e.Op, e.Path, e.Wrapped)
}

func (e *PathSecurityError) Unwrap() error {
	return e.Wrapped
}

// IsPathTraversal checks if the error is a path traversal error
func IsPathTraversal(err error) bool {
	return errors.Is(err, ErrPathTraversal)
}

// IsSymlinkEscape checks if the error is a symlink escape error
func IsSymlinkEscape(err error) bool {
	return errors.Is(err, ErrSymlinkEscape)
}

// PathResolver handles secure path resolution within workspaces
// This is the SINGLE SOURCE OF TRUTH for all path security operations
type PathResolver struct {
	cfg *config.AppConfig
}

// NewPathResolver creates a new path resolver
func NewPathResolver(cfg *config.AppConfig) *PathResolver {
	return &PathResolver{cfg: cfg}
}

// siteNameRegex validates site names (alphanumeric with dots and dashes)
var siteNameRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$`)

// ResolveWorkspaceBase returns the base path for a workspace
func (p *PathResolver) ResolveWorkspaceBase(workspace string) (string, error) {
	if strings.HasPrefix(workspace, "site:") {
		siteName := strings.TrimPrefix(workspace, "site:")
		if !siteNameRegex.MatchString(siteName) {
			return "", &PathSecurityError{Op: "resolve", Path: siteName, Wrapped: ErrInvalidSiteName}
		}
		return filepath.Join(p.cfg.ResolvedSitesPath, siteName, "user"), nil
	}

	if workspace == "root" {
		return p.cfg.ResolvedUploadCwd, nil
	}

	// Default: treat as site name directly (for WebSocket workspace parameter)
	return filepath.Join(p.cfg.ResolvedSitesPath, workspace), nil
}

// ResolveSafePath resolves a user-provided path safely within a base directory
// It prevents path traversal and symlink escapes
// This is the CANONICAL implementation - all handlers must use this
func (p *PathResolver) ResolveSafePath(basePath, userPath string) (string, error) {
	// Block absolute paths immediately - they bypass the base path
	if filepath.IsAbs(userPath) {
		return "", &PathSecurityError{Op: "check_absolute", Path: userPath, Wrapped: ErrPathTraversal}
	}

	// Check for traversal patterns early (defense in depth)
	if ContainsTraversalPattern(userPath) {
		return "", &PathSecurityError{Op: "check_pattern", Path: userPath, Wrapped: ErrPathTraversal}
	}

	// First resolve the base path (follow symlinks)
	realBase, err := filepath.EvalSymlinks(basePath)
	if err != nil {
		// If base doesn't exist, use the absolute path
		realBase, err = filepath.Abs(basePath)
		if err != nil {
			return "", &PathSecurityError{Op: "resolve_base", Path: basePath, Wrapped: ErrInvalidPath}
		}
	}

	// Join and get absolute path
	joined := filepath.Join(basePath, userPath)
	absPath, err := filepath.Abs(joined)
	if err != nil {
		return "", &PathSecurityError{Op: "resolve_joined", Path: joined, Wrapped: ErrInvalidPath}
	}

	// Check for basic path traversal before following symlinks
	if !isWithinBase(absPath, realBase) {
		return "", &PathSecurityError{Op: "check_traversal", Path: userPath, Wrapped: ErrPathTraversal}
	}

	// If the path exists, resolve symlinks and check again
	if _, err := os.Lstat(absPath); err == nil {
		realPath, err := filepath.EvalSymlinks(absPath)
		if err != nil {
			return "", &PathSecurityError{Op: "resolve_symlink", Path: absPath, Wrapped: ErrInvalidPath}
		}
		// Check the real path is within base
		if !isWithinBase(realPath, realBase) {
			filesLog.Warn("Symlink escape attempt: %s -> %s (base: %s)", absPath, realPath, realBase)
			return "", &PathSecurityError{Op: "check_symlink", Path: userPath, Wrapped: ErrSymlinkEscape}
		}
		return realPath, nil
	}

	// Path doesn't exist yet, return the absolute path
	return absPath, nil
}

// ResolveForWorkspace combines workspace resolution and path resolution
// Returns (basePath, resolvedPath, error)
func (p *PathResolver) ResolveForWorkspace(workspace, userPath string) (string, string, error) {
	basePath, err := p.ResolveWorkspaceBase(workspace)
	if err != nil {
		return "", "", err
	}

	resolvedPath, err := p.ResolveSafePath(basePath, userPath)
	if err != nil {
		return "", "", err
	}

	return basePath, resolvedPath, nil
}

// ValidateNotRoot ensures the path is not the root of the workspace
func (p *PathResolver) ValidateNotRoot(basePath, resolvedPath string) error {
	if resolvedPath == basePath {
		return &PathSecurityError{Op: "validate_root", Path: resolvedPath, Wrapped: ErrRootDeletion}
	}
	return nil
}

// ValidateForDeletion performs all validation needed before deleting a path
// Returns (basePath, resolvedPath, error)
func (p *PathResolver) ValidateForDeletion(workspace, userPath string) (string, string, error) {
	// Reject empty or root paths
	if userPath == "" || userPath == "/" || userPath == "." {
		return "", "", &PathSecurityError{Op: "validate_delete", Path: userPath, Wrapped: ErrRootDeletion}
	}

	basePath, resolvedPath, err := p.ResolveForWorkspace(workspace, userPath)
	if err != nil {
		return "", "", err
	}

	// Ensure not deleting the workspace root
	if err := p.ValidateNotRoot(basePath, resolvedPath); err != nil {
		return "", "", err
	}

	// Additional check: ensure within sites directory for site workspaces
	if strings.HasPrefix(workspace, "site:") {
		normalizedSites, _ := filepath.Abs(p.cfg.ResolvedSitesPath)
		if !strings.HasPrefix(resolvedPath, normalizedSites+string(os.PathSeparator)) {
			return "", "", &PathSecurityError{Op: "validate_sites_boundary", Path: userPath, Wrapped: ErrOutsideBoundary}
		}
	}

	return basePath, resolvedPath, nil
}

// GetSitesPath returns the configured sites path
func (p *PathResolver) GetSitesPath() string {
	return p.cfg.ResolvedSitesPath
}

// GetUploadPath returns the configured upload path
func (p *PathResolver) GetUploadPath() string {
	return p.cfg.ResolvedUploadCwd
}

// isWithinBase checks if path is within base directory
func isWithinBase(path, base string) bool {
	return strings.HasPrefix(path, base+string(os.PathSeparator)) || path == base
}

// ContainsTraversalPattern checks if path contains ".." as a path component
// Note: "..." or "a..b" are NOT traversal patterns
func ContainsTraversalPattern(path string) bool {
	// Check for exact match
	if path == ".." {
		return true
	}
	// Check for path separators around ..
	if strings.HasPrefix(path, "../") || strings.HasPrefix(path, "..\\") {
		return true
	}
	if strings.HasSuffix(path, "/..") || strings.HasSuffix(path, "\\..") {
		return true
	}
	if strings.Contains(path, "/../") || strings.Contains(path, "\\..\\") {
		return true
	}
	if strings.Contains(path, "/..\\") || strings.Contains(path, "\\../") {
		return true
	}
	return false
}

// IsValidFilename checks if a filename is safe (no path separators or traversal)
func IsValidFilename(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	return !strings.ContainsAny(name, "/\\")
}

// DefaultExcludedDirs contains directories that should be excluded from tree listings
var DefaultExcludedDirs = map[string]bool{
	"node_modules": true,
	"dist":         true,
	".git":         true,
	".turbo":       true,
	"__pycache__":  true,
}

// HandlePathSecurityError writes an appropriate HTTP error response for path security errors
// This is a shared helper to ensure consistent error responses across handlers
func HandlePathSecurityError(w http.ResponseWriter, err error) {
	var pathErr *PathSecurityError
	if errors.As(err, &pathErr) {
		switch {
		case errors.Is(pathErr.Wrapped, ErrPathTraversal):
			jsonError(w, "Path traversal detected", http.StatusBadRequest)
		case errors.Is(pathErr.Wrapped, ErrSymlinkEscape):
			jsonError(w, "Invalid path (symlink)", http.StatusBadRequest)
		case errors.Is(pathErr.Wrapped, ErrInvalidSiteName):
			jsonError(w, "Invalid site name", http.StatusBadRequest)
		case errors.Is(pathErr.Wrapped, ErrRootDeletion):
			jsonError(w, "Cannot delete root directory", http.StatusBadRequest)
		case errors.Is(pathErr.Wrapped, ErrOutsideBoundary):
			jsonError(w, "Path outside allowed boundary", http.StatusBadRequest)
		default:
			jsonError(w, "Invalid path", http.StatusBadRequest)
		}
		return
	}
	jsonError(w, "Invalid path", http.StatusBadRequest)
}
