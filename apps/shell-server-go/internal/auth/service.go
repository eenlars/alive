package auth

import (
	"os"
	"strings"

	"shell-server-go/internal/config"
	"shell-server-go/internal/workspace"
)

// Service holds auth-related domain logic that can be reused outside HTTP handlers.
type Service struct {
	resolver  *workspace.Resolver
	sitesPath string
}

// NewService creates a new auth service.
func NewService(cfg *config.AppConfig) *Service {
	return &Service{
		resolver:  workspace.NewResolver(cfg),
		sitesPath: cfg.ResolvedSitesPath,
	}
}

// ResolveScopedWorkspace validates and normalizes a workspace input.
func (s *Service) ResolveScopedWorkspace(raw string) (string, error) {
	normalized := strings.TrimSpace(raw)
	if normalized == "" {
		return "", nil
	}
	if normalized == "root" {
		return "root", nil
	}
	if !strings.HasPrefix(normalized, "site:") {
		normalized = "site:" + normalized
	}

	cwd, err := s.resolver.ResolveWorkspaceBase(normalized)
	if err != nil {
		return "", err
	}
	if err := workspace.ValidateSiteWorkspaceBoundary(cwd, s.sitesPath); err != nil {
		return "", err
	}

	info, err := os.Stat(cwd)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", workspace.ErrInvalidPath
	}

	return normalized, nil
}
