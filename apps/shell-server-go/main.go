package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"shell-server-go/internal/config"
	"shell-server-go/internal/handlers"
	"shell-server-go/internal/logger"
	"shell-server-go/internal/middleware"
	"shell-server-go/internal/ratelimit"
	"shell-server-go/internal/session"
)

const (
	// ShutdownTimeout is how long to wait for graceful shutdown
	ShutdownTimeout = 30 * time.Second
	// ReadTimeout is the maximum duration for reading the entire request
	ReadTimeout = 30 * time.Second
	// WriteTimeout is the maximum duration before timing out writes of the response
	WriteTimeout = 60 * time.Second
	// IdleTimeout is the maximum amount of time to wait for the next request
	IdleTimeout = 120 * time.Second
)

func main() {
	// Initialize logger
	logger.Init(logger.Config{
		Output:   os.Stdout,
		MinLevel: logger.INFO,
		UseColor: true,
	})

	log := logger.WithComponent("MAIN")

	// Find config path
	cwd, _ := os.Getwd()
	configPath := filepath.Join(cwd, "config.json")

	// Also check if running from cmd/server directory
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		configPath = filepath.Join(cwd, "..", "..", "config.json")
	}

	// Load configuration
	cfg, err := config.Load(configPath)
	if err != nil {
		if errors.Is(err, config.ErrMissingPassword) {
			log.Error("SHELL_PASSWORD environment variable is required")
			os.Exit(1)
		}
		log.Error("Failed to load config: %v", err)
		os.Exit(1)
	}

	log.Info("Environment: %s", cfg.Env)
	log.Info("Port: %d", cfg.Port)
	log.Info("Default workspace: %s", cfg.ResolvedDefaultCwd)
	log.Info("Workspace selection: %v", cfg.AllowWorkspaceSelection)

	// Print editable directories
	for _, dir := range cfg.EditableDirectories {
		if _, err := os.Stat(dir.Path); err == nil {
			log.Info("Editable directory: %s -> %s", dir.Label, dir.Path)
		} else {
			log.Warn("Directory not found: %s -> %s", dir.Label, dir.Path)
		}
	}

	// Initialize session store
	sessionsFile := filepath.Join(cwd, ".sessions.json")
	sessions := session.NewStore(sessionsFile)
	log.Info("Loaded %d sessions from disk", sessions.Count())

	// Initialize rate limiter
	rateLimitFile := filepath.Join(cwd, ".rate-limit-state.json")
	limiter := ratelimit.NewLimiter(rateLimitFile)

	// Create handlers
	authHandler := handlers.NewAuthHandler(cfg, sessions, limiter)
	fileHandler := handlers.NewFileHandler(cfg)
	editorHandler := handlers.NewEditorHandler(cfg)
	wsHandler := handlers.NewWSHandler(cfg, sessions)
	templateHandler := handlers.NewTemplateHandler(cfg)

	// Create router
	mux := http.NewServeMux()

	// Auth middleware helper
	authAPIMiddleware := middleware.AuthAPI(sessions)

	// Get embedded client filesystem for SPA
	clientFS, err := GetEmbeddedClientFS()
	if err != nil {
		log.Error("Failed to get embedded client files: %v", err)
		os.Exit(1)
	}
	log.Info("Client files served from embedded filesystem")

	// Auth API routes
	mux.HandleFunc("POST /login", authHandler.Login)
	mux.HandleFunc("/logout", authHandler.Logout)

	// Config API (protected) - returns client config
	mux.Handle("GET /api/config", authAPIMiddleware(http.HandlerFunc(fileHandler.Config)))

	// Health check (public)
	mux.HandleFunc("/health", fileHandler.Health)

	// WebSocket (handles its own auth)
	mux.HandleFunc("/ws", wsHandler.Handle)
	mux.Handle("POST /api/ws-lease", authAPIMiddleware(http.HandlerFunc(wsHandler.CreateLease)))

	// File API routes (protected)
	mux.Handle("POST /api/check-directory", authAPIMiddleware(http.HandlerFunc(fileHandler.CheckDirectory)))
	mux.Handle("POST /api/create-directory", authAPIMiddleware(http.HandlerFunc(fileHandler.CreateDirectory)))
	mux.Handle("POST /api/upload", authAPIMiddleware(http.HandlerFunc(fileHandler.Upload)))
	mux.Handle("POST /api/list-files", authAPIMiddleware(http.HandlerFunc(fileHandler.ListFiles)))
	mux.Handle("POST /api/read-file", authAPIMiddleware(http.HandlerFunc(fileHandler.ReadFile)))
	mux.Handle("GET /api/download-file", authAPIMiddleware(http.HandlerFunc(fileHandler.DownloadFile)))
	mux.Handle("POST /api/delete-folder", authAPIMiddleware(http.HandlerFunc(fileHandler.DeleteFolder)))
	mux.Handle("GET /api/sites", authAPIMiddleware(http.HandlerFunc(fileHandler.ListSites)))

	// Editor API routes (protected)
	mux.Handle("POST /api/edit/list-files", authAPIMiddleware(http.HandlerFunc(editorHandler.ListFiles)))
	mux.Handle("POST /api/edit/read-file", authAPIMiddleware(http.HandlerFunc(editorHandler.ReadFile)))
	mux.Handle("POST /api/edit/write-file", authAPIMiddleware(http.HandlerFunc(editorHandler.WriteFile)))
	mux.Handle("POST /api/edit/check-mtimes", authAPIMiddleware(http.HandlerFunc(editorHandler.CheckMtimes)))
	mux.Handle("POST /api/edit/delete", authAPIMiddleware(http.HandlerFunc(editorHandler.Delete)))
	mux.Handle("POST /api/edit/copy", authAPIMiddleware(http.HandlerFunc(editorHandler.Copy)))

	// Templates API routes (protected)
	mux.Handle("GET /api/templates", authAPIMiddleware(http.HandlerFunc(templateHandler.ListTemplates)))
	mux.Handle("POST /api/templates", authAPIMiddleware(http.HandlerFunc(templateHandler.CreateTemplate)))
	mux.Handle("GET /api/templates/{id}", authAPIMiddleware(http.HandlerFunc(templateHandler.GetTemplate)))
	mux.Handle("PUT /api/templates/{id}", authAPIMiddleware(http.HandlerFunc(templateHandler.SaveTemplate)))

	// SPA handler - serves index.html for all non-API, non-asset routes
	spaHandler := createSPAHandler(clientFS)
	mux.Handle("/", spaHandler)

	// Create server with timeouts
	addr := fmt.Sprintf(":%d", cfg.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  ReadTimeout,
		WriteTimeout: WriteTimeout,
		IdleTimeout:  IdleTimeout,
	}

	// Start server in goroutine
	serverErr := make(chan error, 1)
	go func() {
		log.Info("Shell server (Go) starting on http://localhost%s", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// Setup signal handling for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Wait for shutdown signal or server error
	select {
	case err := <-serverErr:
		log.Error("Server error: %v", err)
		os.Exit(1)
	case sig := <-quit:
		log.Info("Received signal %v, initiating graceful shutdown...", sig)
	}

	// Create shutdown context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), ShutdownTimeout)
	defer cancel()

	// Shutdown WebSocket connections first
	log.Info("Closing WebSocket connections...")
	wsHandler.Shutdown(ctx)

	// Shutdown HTTP server
	log.Info("Shutting down HTTP server...")
	if err := server.Shutdown(ctx); err != nil {
		log.Error("Server shutdown error: %v", err)
	}

	// Stop rate limiter cleanup goroutine
	limiter.Stop()

	// Stop session cleanup goroutine
	sessions.Stop()

	log.Info("Server stopped gracefully")
}

// createSPAHandler creates a handler that serves the SPA
// - Static assets (js, css, etc.) are served directly
// - All other routes get index.html for client-side routing
func createSPAHandler(clientFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(clientFS))

	return middleware.Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Clean path
		if path == "" {
			path = "/"
		}

		// Try to serve static file first
		if path != "/" {
			// Remove leading slash for fs.Open
			filePath := strings.TrimPrefix(path, "/")

			// Check if file exists in embedded FS
			if f, err := clientFS.Open(filePath); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// Serve index.html for all other routes (SPA fallback)
		indexFile, err := fs.ReadFile(clientFS, "index.html")
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexFile)
	}))
}
