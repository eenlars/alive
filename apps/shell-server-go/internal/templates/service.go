package templates

import "shell-server-go/internal/config"

// Service is a placeholder for reusable template-domain business logic.
type Service struct {
	config *config.AppConfig
}

// NewService creates a template service.
func NewService(cfg *config.AppConfig) *Service {
	return &Service{config: cfg}
}
