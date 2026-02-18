package workspace

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"shell-server-go/internal/config"
	"shell-server-go/internal/httpx/response"
	"shell-server-go/internal/logger"
)

var log = logger.WithComponent("WORKSPACE")

// Path security errors.
var (
	ErrPathTraversal   = errors.New("path traversal detected")
	ErrSymlinkEscape   = errors.New("symlink escape detected")
	ErrInvalidPath     = errors.New("invalid path")
	ErrOutsideBoundary = errors.New("path outside allowed boundary")
	ErrInvalidSiteName = errors.New("invalid site name")
	ErrRootDeletion    = errors.New("cannot delete root directory")
)

// PathSecurityError wraps path security errors with context.
type PathSecurityError struct {
	Op      string
	Path    string
	Wrapped error
}

func (e *PathSecurityError) Error() string {
	return fmt.Sprintf("%s: %s: %v", e.Op, e.Path, e.Wrapped)
}

func (e *PathSecurityError) Unwrap() error {
	return e.Wrapped
}

func IsPathTraversal(err error) bool {
	return errors.Is(err, ErrPathTraversal)
}

func IsSymlinkEscape(err error) bool {
	return errors.Is(err, ErrSymlinkEscape)
}

// Resolver handles secure path resolution within workspaces.
type Resolver struct {
	cfg *config.AppConfig
}

func NewResolver(cfg *config.AppConfig) *Resolver {
	return &Resolver{cfg: cfg}
}

var siteNameRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$`)

func (p *Resolver) ResolveWorkspaceBase(workspace string) (string, error) {
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

	return filepath.Join(p.cfg.ResolvedSitesPath, workspace), nil
}

func (p *Resolver) ResolveSafePath(basePath, userPath string) (string, error) {
	if filepath.IsAbs(userPath) {
		return "", &PathSecurityError{Op: "check_absolute", Path: userPath, Wrapped: ErrPathTraversal}
	}

	if ContainsTraversalPattern(userPath) {
		return "", &PathSecurityError{Op: "check_pattern", Path: userPath, Wrapped: ErrPathTraversal}
	}

	realBase, err := filepath.EvalSymlinks(basePath)
	if err != nil {
		realBase, err = filepath.Abs(basePath)
		if err != nil {
			return "", &PathSecurityError{Op: "resolve_base", Path: basePath, Wrapped: ErrInvalidPath}
		}
	}

	joined := filepath.Join(basePath, userPath)
	absPath, err := filepath.Abs(joined)
	if err != nil {
		return "", &PathSecurityError{Op: "resolve_joined", Path: joined, Wrapped: ErrInvalidPath}
	}

	if !isWithinBase(absPath, realBase) {
		return "", &PathSecurityError{Op: "check_traversal", Path: userPath, Wrapped: ErrPathTraversal}
	}

	if _, err := os.Lstat(absPath); err == nil {
		realPath, err := filepath.EvalSymlinks(absPath)
		if err != nil {
			return "", &PathSecurityError{Op: "resolve_symlink", Path: absPath, Wrapped: ErrInvalidPath}
		}
		if !isWithinBase(realPath, realBase) {
			log.Warn("Symlink escape attempt: %s -> %s (base: %s)", absPath, realPath, realBase)
			return "", &PathSecurityError{Op: "check_symlink", Path: userPath, Wrapped: ErrSymlinkEscape}
		}
		return realPath, nil
	}

	return absPath, nil
}

func (p *Resolver) ResolveForWorkspace(workspace, userPath string) (string, string, error) {
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

func (p *Resolver) ValidateNotRoot(basePath, resolvedPath string) error {
	if resolvedPath == basePath {
		return &PathSecurityError{Op: "validate_root", Path: resolvedPath, Wrapped: ErrRootDeletion}
	}
	return nil
}

func (p *Resolver) ValidateForDeletion(workspace, userPath string) (string, string, error) {
	if userPath == "" || userPath == "/" || userPath == "." {
		return "", "", &PathSecurityError{Op: "validate_delete", Path: userPath, Wrapped: ErrRootDeletion}
	}

	basePath, resolvedPath, err := p.ResolveForWorkspace(workspace, userPath)
	if err != nil {
		return "", "", err
	}

	if err := p.ValidateNotRoot(basePath, resolvedPath); err != nil {
		return "", "", err
	}

	if strings.HasPrefix(workspace, "site:") {
		normalizedSites, _ := filepath.Abs(p.cfg.ResolvedSitesPath)
		if !strings.HasPrefix(resolvedPath, normalizedSites+string(os.PathSeparator)) {
			return "", "", &PathSecurityError{Op: "validate_sites_boundary", Path: userPath, Wrapped: ErrOutsideBoundary}
		}
	}

	return basePath, resolvedPath, nil
}

func (p *Resolver) GetSitesPath() string {
	return p.cfg.ResolvedSitesPath
}

func (p *Resolver) GetUploadPath() string {
	return p.cfg.ResolvedUploadCwd
}

func ContainsTraversalPattern(path string) bool {
	if path == ".." {
		return true
	}
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

func IsValidFilename(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	return !strings.ContainsAny(name, "/\\")
}

var DefaultExcludedDirs = map[string]bool{
	"node_modules": true,
	"dist":         true,
	".git":         true,
	".turbo":       true,
	"__pycache__":  true,
}

func HandlePathSecurityError(w http.ResponseWriter, err error) {
	var pathErr *PathSecurityError
	if errors.As(err, &pathErr) {
		switch {
		case errors.Is(pathErr.Wrapped, ErrPathTraversal):
			response.Error(w, http.StatusBadRequest, "Path traversal detected")
		case errors.Is(pathErr.Wrapped, ErrSymlinkEscape):
			response.Error(w, http.StatusBadRequest, "Invalid path (symlink)")
		case errors.Is(pathErr.Wrapped, ErrInvalidSiteName):
			response.Error(w, http.StatusBadRequest, "Invalid site name")
		case errors.Is(pathErr.Wrapped, ErrRootDeletion):
			response.Error(w, http.StatusBadRequest, "Cannot delete root directory")
		case errors.Is(pathErr.Wrapped, ErrOutsideBoundary):
			response.Error(w, http.StatusBadRequest, "Path outside allowed boundary")
		default:
			response.Error(w, http.StatusBadRequest, "Invalid path")
		}
		return
	}
	response.Error(w, http.StatusBadRequest, "Invalid path")
}
