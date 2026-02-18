package editor

import "shell-server-go/internal/config"

// Service is a placeholder for reusable editor-domain business logic.
type Service struct {
	config *config.AppConfig
}

// NewService creates a new editor service.
func NewService(cfg *config.AppConfig) *Service {
	return &Service{config: cfg}
}
