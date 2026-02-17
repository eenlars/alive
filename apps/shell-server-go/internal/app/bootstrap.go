package app

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"shell-server-go/internal/auth"
	"shell-server-go/internal/config"
	"shell-server-go/internal/editor"
	"shell-server-go/internal/files"
	"shell-server-go/internal/logger"
	"shell-server-go/internal/ratelimit"
	"shell-server-go/internal/session"
	"shell-server-go/internal/templates"
	"shell-server-go/internal/terminal"
)

// ServerApp holds all runtime dependencies for the shell server.
type ServerApp struct {
	Config          *config.AppConfig
	Sessions        *session.Store
	Limiter         *ratelimit.Limiter
	AuthHandler     *auth.Handler
	FileHandler     *files.Handler
	EditorHandler   *editor.Handler
	WSHandler       *terminal.WSHandler
	TemplateHandler *templates.Handler
	ClientFS        fs.FS
	Logger          *logger.Logger
	WorkingDir      string
}

// New builds a fully wired server application.
func New(clientFS fs.FS, configPath string) (*ServerApp, error) {
	if clientFS == nil {
		return nil, errors.New("client filesystem is required")
	}

	logger.Init(logger.Config{
		Output:   os.Stdout,
		MinLevel: logger.INFO,
		UseColor: true,
	})

	log := logger.WithComponent("MAIN")

	cwd, _ := os.Getwd()
	resolvedConfigPath, err := resolveConfigPath(cwd, configPath)
	if err != nil {
		return nil, err
	}

	cfg, err := config.Load(resolvedConfigPath)
	if err != nil {
		if errors.Is(err, config.ErrMissingPassword) {
			log.Error("SHELL_PASSWORD environment variable is required")
		}
		return nil, err
	}

	log.Info("Environment: %s", cfg.Env)
	log.Info("Port: %d", cfg.Port)
	log.Info("Default workspace: %s", cfg.ResolvedDefaultCwd)
	log.Info("Workspace selection: %v", cfg.AllowWorkspaceSelection)

	for _, dir := range cfg.EditableDirectories {
		if _, statErr := os.Stat(dir.Path); statErr == nil {
			log.Info("Editable directory: %s -> %s", dir.Label, dir.Path)
		} else {
			log.Warn("Directory not found: %s -> %s", dir.Label, dir.Path)
		}
	}

	sessionsFile := filepath.Join(cwd, ".sessions.json")
	sessions := session.NewStore(sessionsFile)
	log.Info("Loaded %d sessions from disk", sessions.Count())

	rateLimitFile := filepath.Join(cwd, ".rate-limit-state.json")
	limiter := ratelimit.NewLimiter(rateLimitFile)

	return &ServerApp{
		Config:          cfg,
		Sessions:        sessions,
		Limiter:         limiter,
		AuthHandler:     auth.NewHandler(cfg, sessions, limiter),
		FileHandler:     files.NewHandler(cfg, sessions),
		EditorHandler:   editor.NewHandler(cfg, sessions),
		WSHandler:       terminal.NewWSHandler(cfg, sessions),
		TemplateHandler: templates.NewHandler(cfg, sessions),
		ClientFS:        clientFS,
		Logger:          log,
		WorkingDir:      cwd,
	}, nil
}

func resolveConfigPath(cwd, explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}

	candidate := filepath.Join(cwd, "config.json")
	if _, err := os.Stat(candidate); err == nil {
		return candidate, nil
	}

	candidate = filepath.Join(cwd, "..", "..", "config.json")
	if _, err := os.Stat(candidate); err == nil {
		return candidate, nil
	}

	return filepath.Join(cwd, "config.json"), nil
}

// Run initializes and starts the server until shutdown.
func Run(clientFS fs.FS, configPath string) error {
	app, err := New(clientFS, configPath)
	if err != nil {
		return err
	}
	return app.Run()
}
