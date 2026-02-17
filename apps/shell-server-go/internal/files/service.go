package files

import (
	"shell-server-go/internal/config"
	"shell-server-go/internal/workspace"
)

// Service groups reusable file-domain helpers.
type Service struct {
	resolver *workspace.Resolver
}

// NewService creates a file service.
func NewService(cfg *config.AppConfig) *Service {
	return &Service{resolver: workspace.NewResolver(cfg)}
}

// ResolveForWorkspace resolves a user path within a workspace boundary.
func (s *Service) ResolveForWorkspace(workspaceID, userPath string) (string, string, error) {
	return s.resolver.ResolveForWorkspace(workspaceID, userPath)
}
