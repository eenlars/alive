package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"shell-server-go/internal/logger"
)

var log = logger.WithComponent("CONFIG")

// EnvConfig holds environment-specific configuration
type EnvConfig struct {
	Port                    int    `json:"port"`
	DefaultWorkspace        string `json:"defaultWorkspace"`
	DefaultCwd              string `json:"defaultCwd"`
	UploadDefaultCwd        string `json:"uploadDefaultCwd"`
	SitesPath               string `json:"sitesPath"`
	WorkspaceBase           string `json:"workspaceBase"`
	AllowWorkspaceSelection bool   `json:"allowWorkspaceSelection"`
}

// Config holds all configuration
type Config struct {
	Development EnvConfig `json:"development"`
	Production  EnvConfig `json:"production"`
}

// EditableDirectory represents a directory that can be edited
type EditableDirectory struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Path  string `json:"path"`
}

// AppConfig holds the resolved application configuration
type AppConfig struct {
	Env                     string
	Port                    int
	DefaultWorkspace        string
	ResolvedDefaultCwd      string
	ResolvedUploadCwd       string
	ResolvedSitesPath       string
	WorkspaceBase           string
	AllowWorkspaceSelection bool
	EditableDirectories     []EditableDirectory
	ShellPassword           string
}

// Common configuration errors
var (
	ErrMissingPassword    = errors.New("SHELL_PASSWORD environment variable is required")
	ErrInvalidPort        = errors.New("port must be between 1 and 65535")
	ErrMissingConfigFile  = errors.New("config.json not found")
	ErrInvalidConfig      = errors.New("invalid configuration")
)

// ValidationError contains details about a configuration validation failure
type ValidationError struct {
	Field   string
	Message string
}

func (e ValidationError) Error() string {
	return fmt.Sprintf("config validation error: %s - %s", e.Field, e.Message)
}

// ValidationErrors is a collection of validation errors
type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
	if len(e) == 0 {
		return "no validation errors"
	}
	if len(e) == 1 {
		return e[0].Error()
	}
	return fmt.Sprintf("%d config validation errors: %s (and %d more)", len(e), e[0].Error(), len(e)-1)
}

// Validate checks the configuration for errors
func (c *AppConfig) Validate() ValidationErrors {
	var errs ValidationErrors

	// Port validation
	if c.Port < 1 || c.Port > 65535 {
		errs = append(errs, ValidationError{Field: "port", Message: fmt.Sprintf("invalid port %d, must be 1-65535", c.Port)})
	}

	// Password validation
	if c.ShellPassword == "" {
		errs = append(errs, ValidationError{Field: "shellPassword", Message: "password is required"})
	} else if len(c.ShellPassword) < 8 {
		log.Warn("Shell password is less than 8 characters - consider using a stronger password")
	}

	// Directory validations
	if c.ResolvedDefaultCwd != "" {
		if info, err := os.Stat(c.ResolvedDefaultCwd); err != nil {
			if !os.IsNotExist(err) {
				errs = append(errs, ValidationError{Field: "defaultCwd", Message: fmt.Sprintf("cannot access: %v", err)})
			}
			// Not existing is OK - we create it
		} else if !info.IsDir() {
			errs = append(errs, ValidationError{Field: "defaultCwd", Message: "path exists but is not a directory"})
		}
	}

	if c.ResolvedSitesPath != "" {
		if info, err := os.Stat(c.ResolvedSitesPath); err != nil {
			if !os.IsNotExist(err) {
				errs = append(errs, ValidationError{Field: "sitesPath", Message: fmt.Sprintf("cannot access: %v", err)})
			}
		} else if !info.IsDir() {
			errs = append(errs, ValidationError{Field: "sitesPath", Message: "path exists but is not a directory"})
		}
	}

	// Editable directories validation
	seenIDs := make(map[string]bool)
	for i, dir := range c.EditableDirectories {
		if dir.ID == "" {
			errs = append(errs, ValidationError{Field: fmt.Sprintf("editableDirectories[%d].id", i), Message: "ID is required"})
		} else if seenIDs[dir.ID] {
			errs = append(errs, ValidationError{Field: fmt.Sprintf("editableDirectories[%d].id", i), Message: fmt.Sprintf("duplicate ID: %s", dir.ID)})
		} else {
			seenIDs[dir.ID] = true
		}

		if dir.Label == "" {
			errs = append(errs, ValidationError{Field: fmt.Sprintf("editableDirectories[%d].label", i), Message: "label is required"})
		}

		if dir.Path == "" {
			errs = append(errs, ValidationError{Field: fmt.Sprintf("editableDirectories[%d].path", i), Message: "path is required"})
		}
	}

	return errs
}

// Load loads configuration from config.json
func Load(configPath string) (*AppConfig, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%w: %s", ErrMissingConfigFile, configPath)
		}
		return nil, fmt.Errorf("read config file: %w", err)
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parse config JSON: %w", err)
	}

	// Determine environment
	env := os.Getenv("NODE_ENV")
	if env == "" {
		env = "development"
	}

	var envConfig EnvConfig
	if env == "production" {
		envConfig = config.Production
	} else {
		envConfig = config.Development
	}

	// Override port from environment
	if portEnv := os.Getenv("PORT"); portEnv != "" {
		var port int
		if err := json.Unmarshal([]byte(portEnv), &port); err == nil {
			envConfig.Port = port
		}
	}

	// Resolve paths
	cwd, _ := os.Getwd()

	resolvePathFn := func(path string) string {
		if filepath.IsAbs(path) {
			return path
		}
		return filepath.Join(cwd, path)
	}

	// Allow env var override for default cwd
	defaultCwd := envConfig.DefaultCwd
	if envOverride := os.Getenv("SHELL_DEFAULT_CWD"); envOverride != "" {
		defaultCwd = envOverride
		log.Info("Using SHELL_DEFAULT_CWD override: %s", envOverride)
	}

	resolvedDefaultCwd := resolvePathFn(defaultCwd)
	resolvedUploadCwd := resolvePathFn(envConfig.UploadDefaultCwd)
	resolvedSitesPath := resolvePathFn(envConfig.SitesPath)

	// Create development workspace if needed
	if env == "development" {
		if _, err := os.Stat(resolvedDefaultCwd); os.IsNotExist(err) {
			os.MkdirAll(resolvedDefaultCwd, 0755)
			readme := `# Local Development Workspace

This directory is your local shell-server workspace for development.

- Auto-created by shell-server on first run
- Gitignored (won't be committed)
- Isolated from production infrastructure
- Safe to experiment with files and scripts

When you run the shell server and access the terminal, this is your working directory.
`
			os.WriteFile(filepath.Join(resolvedDefaultCwd, "README.md"), []byte(readme), 0644)
		}
	}

	// Get shell password
	shellPassword := os.Getenv("SHELL_PASSWORD")
	if shellPassword == "" {
		return nil, ErrMissingPassword
	}

	// Build editable directories
	claudeBridgeRoot := filepath.Join(cwd, "..", "..")
	editableDirs := []EditableDirectory{
		{
			ID:    "docs",
			Label: "Claude Bridge Docs",
			Path:  filepath.Join(claudeBridgeRoot, "docs"),
		},
		{
			ID:    "workflows",
			Label: "Workflows",
			Path:  filepath.Join(claudeBridgeRoot, "packages", "tools", "workflows"),
		},
		{
			ID:    "plans",
			Label: "Plans",
			Path:  filepath.Join(claudeBridgeRoot, "docs", "plans"),
		},
		{
			ID:    "uploads",
			Label: "Uploads",
			Path:  "/root/uploads",
		},
		{
			ID:    "sites",
			Label: "Sites",
			Path:  resolvedSitesPath,
		},
	}

	cfg := &AppConfig{
		Env:                     env,
		Port:                    envConfig.Port,
		DefaultWorkspace:        envConfig.DefaultWorkspace,
		ResolvedDefaultCwd:      resolvedDefaultCwd,
		ResolvedUploadCwd:       resolvedUploadCwd,
		ResolvedSitesPath:       resolvedSitesPath,
		WorkspaceBase:           envConfig.WorkspaceBase,
		AllowWorkspaceSelection: envConfig.AllowWorkspaceSelection,
		EditableDirectories:     editableDirs,
		ShellPassword:           shellPassword,
	}

	// Validate configuration
	if errs := cfg.Validate(); len(errs) > 0 {
		for _, err := range errs {
			log.Error("Validation error: %s", err.Error())
		}
		return nil, fmt.Errorf("%w: %s", ErrInvalidConfig, errs.Error())
	}

	log.Info("Configuration loaded successfully | env=%s port=%d", cfg.Env, cfg.Port)
	return cfg, nil
}

// MustLoad loads configuration and panics on error
func MustLoad(configPath string) *AppConfig {
	cfg, err := Load(configPath)
	if err != nil {
		panic(fmt.Sprintf("failed to load config: %v", err))
	}
	return cfg
}

// GetEditableDirectory returns an editable directory by ID
func (c *AppConfig) GetEditableDirectory(id string) *EditableDirectory {
	for _, dir := range c.EditableDirectories {
		if dir.ID == id {
			return &dir
		}
	}
	return nil
}
