package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	ShutdownTimeout = 30 * time.Second
	ReadTimeout     = 30 * time.Second
	WriteTimeout    = 60 * time.Second
	IdleTimeout     = 120 * time.Second
)

// Run starts serving HTTP traffic and handles graceful shutdown.
func (a *ServerApp) Run() error {
	router, err := a.Router()
	if err != nil {
		a.cleanup()
		return err
	}

	addr := fmt.Sprintf(":%d", a.Config.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  ReadTimeout,
		WriteTimeout: WriteTimeout,
		IdleTimeout:  IdleTimeout,
	}

	serverErr := make(chan error, 1)
	go func() {
		a.Logger.Info("Shell server (Go) starting on http://localhost%s", addr)
		if listenErr := server.ListenAndServe(); listenErr != nil && !errors.Is(listenErr, http.ErrServerClosed) {
			serverErr <- listenErr
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	var runErr error
	select {
	case runErr = <-serverErr:
		a.Logger.Error("Server error: %v", runErr)
	case sig := <-quit:
		a.Logger.Info("Received signal %v, initiating graceful shutdown...", sig)
	}

	ctx, cancel := context.WithTimeout(context.Background(), ShutdownTimeout)
	defer cancel()

	a.Logger.Info("Closing WebSocket connections...")
	a.WSHandler.Shutdown(ctx)

	a.Logger.Info("Shutting down HTTP server...")
	if shutdownErr := server.Shutdown(ctx); shutdownErr != nil {
		a.Logger.Error("Server shutdown error: %v", shutdownErr)
		if runErr == nil {
			runErr = shutdownErr
		}
	}

	a.cleanup()
	if runErr == nil {
		a.Logger.Info("Server stopped gracefully")
	}
	return runErr
}

func (a *ServerApp) cleanup() {
	if a == nil {
		return
	}
	if a.Limiter != nil {
		a.Limiter.Stop()
	}
	if a.Sessions != nil {
		a.Sessions.Stop()
	}
}
