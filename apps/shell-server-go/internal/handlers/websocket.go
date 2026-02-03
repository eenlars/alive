package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"

	"shell-server-go/internal/config"
	"shell-server-go/internal/logger"
	"shell-server-go/internal/middleware"
	"shell-server-go/internal/session"
)

const (
	// MaxConcurrentConnections is the maximum number of simultaneous WebSocket connections
	MaxConcurrentConnections = 50

	// ConnectionTimeout is the maximum lifetime of a WebSocket connection
	ConnectionTimeout = 4 * time.Hour

	// IdleTimeout is how long a connection can be idle before being closed
	IdleTimeout = 30 * time.Minute

	// WriteTimeout is the timeout for writing to WebSocket
	WriteTimeout = 10 * time.Second

	// PingInterval is how often to send ping messages
	PingInterval = 30 * time.Second

	// PongTimeout is how long to wait for pong response (5 min to survive brief internet outages)
	PongTimeout = 5 * time.Minute

	// PTYReadBufferSize is the buffer size for reading from PTY
	PTYReadBufferSize = 8192
)

var wsLog = logger.WithComponent("WS")

// WSHandler handles WebSocket connections
type WSHandler struct {
	config           *config.AppConfig
	sessions         *session.Store
	upgrader         websocket.Upgrader
	activeConns      int32
	connections      sync.Map // map[*websocket.Conn]*connInfo
	shutdownChan     chan struct{}
	shutdownComplete chan struct{}
}

// connInfo tracks information about a connection
type connInfo struct {
	workspace  string
	pid        int
	startTime  time.Time
	cancelFunc context.CancelFunc
	writeMu    sync.Mutex // Protects concurrent writes to websocket
}

// WSMessage represents a WebSocket message
type WSMessage struct {
	Type     string `json:"type"`
	Data     string `json:"data,omitempty"`
	Cols     int    `json:"cols,omitempty"`
	Rows     int    `json:"rows,omitempty"`
	ExitCode int    `json:"exitCode,omitempty"`
	Message  string `json:"message,omitempty"`
}

// NewWSHandler creates a new WebSocket handler
func NewWSHandler(cfg *config.AppConfig, sessions *session.Store) *WSHandler {
	return &WSHandler{
		config:   cfg,
		sessions: sessions,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				// In production, validate origin against allowed domains
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true // Allow connections without origin (like wscat)
				}
				// Allow same-origin and localhost for development
				host := r.Host
				if strings.Contains(origin, host) {
					return true
				}
				if strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1") {
					return true
				}
				// Log rejected origins for debugging
				wsLog.Warn("Rejected WebSocket origin: %s (host: %s)", origin, host)
				return false
			},
		},
		shutdownChan:     make(chan struct{}),
		shutdownComplete: make(chan struct{}),
	}
}

// Handle handles WebSocket connections
func (h *WSHandler) Handle(w http.ResponseWriter, r *http.Request) {
	// Check authentication
	if !middleware.IsAuthenticated(r, h.sessions) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Check connection limit
	currentConns := atomic.LoadInt32(&h.activeConns)
	if currentConns >= MaxConcurrentConnections {
		wsLog.Warn("Connection rejected: max connections reached (%d)", currentConns)
		http.Error(w, "Too many connections", http.StatusServiceUnavailable)
		return
	}

	// Get workspace from query
	workspace := r.URL.Query().Get("workspace")
	if workspace == "" {
		workspace = "root"
	}

	// Determine working directory
	var cwd string
	if workspace == "root" {
		cwd = h.config.ResolvedDefaultCwd
	} else {
		cwd = filepath.Join(h.config.ResolvedSitesPath, workspace)
	}

	// Validate workspace directory exists
	if _, err := os.Stat(cwd); os.IsNotExist(err) {
		wsLog.Error("Workspace directory does not exist: %s", cwd)
		http.Error(w, "Workspace not found", http.StatusNotFound)
		return
	}

	// Upgrade connection
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		wsLog.Error("WebSocket upgrade failed: %v", err)
		return
	}

	// Track connection
	atomic.AddInt32(&h.activeConns, 1)
	defer atomic.AddInt32(&h.activeConns, -1)

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), ConnectionTimeout)
	defer cancel()

	// Store connection info
	info := &connInfo{
		workspace:  workspace,
		startTime:  time.Now(),
		cancelFunc: cancel,
	}
	h.connections.Store(conn, info)
	defer h.connections.Delete(conn)

	wsLog.Info("Connection opened | workspace=%s cwd=%s remoteAddr=%s", workspace, cwd, r.RemoteAddr)

	// Run the PTY session
	h.runPTYSession(ctx, conn, cwd, info)
}

// runPTYSession manages a PTY session over WebSocket
func (h *WSHandler) runPTYSession(ctx context.Context, conn *websocket.Conn, cwd string, info *connInfo) {
	// Ensure connection is closed when we exit
	defer func() {
		conn.Close()
		wsLog.Info("Connection closed | workspace=%s duration=%v", info.workspace, time.Since(info.startTime))
	}()

	// Start shell
	shell := "/bin/bash"
	cmd := exec.CommandContext(ctx, shell)
	cmd.Dir = cwd

	// Set environment with TERM=xterm-256color for color support
	env := os.Environ()
	filteredEnv := make([]string, 0, len(env)+1)
	for _, e := range env {
		if !strings.HasPrefix(e, "TERM=") {
			filteredEnv = append(filteredEnv, e)
		}
	}
	filteredEnv = append(filteredEnv, "TERM=xterm-256color")
	cmd.Env = filteredEnv

	// Start PTY
	ptmx, err := pty.Start(cmd)
	if err != nil {
		wsLog.Error("Failed to start PTY: %v", err)
		h.sendMessage(conn, info, WSMessage{Type: "error", Message: "Failed to start shell"})
		return
	}

	info.pid = cmd.Process.Pid
	wsLog.Debug("PTY spawned | pid=%d workspace=%s", info.pid, info.workspace)

	// Set initial size
	if err := pty.Setsize(ptmx, &pty.Winsize{Rows: 24, Cols: 80}); err != nil {
		wsLog.Warn("Failed to set initial PTY size: %v", err)
	}

	// Send connected message
	h.sendMessage(conn, info, WSMessage{Type: "connected"})

	// Create channels for coordination
	ptyClosed := make(chan struct{})
	wsClosed := make(chan struct{})

	// Setup ping/pong for connection health
	conn.SetReadDeadline(time.Now().Add(PongTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(PongTimeout))
		return nil
	})

	// Goroutine 1: Read from PTY, write to WebSocket
	go func() {
		defer close(ptyClosed)
		buf := make([]byte, PTYReadBufferSize)

		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					wsLog.Debug("PTY read error: %v | pid=%d", err, info.pid)
				}
				return
			}
			if n > 0 {
				if err := h.sendMessage(conn, info, WSMessage{Type: "data", Data: string(buf[:n])}); err != nil {
					wsLog.Debug("WebSocket write failed: %v | pid=%d", err, info.pid)
					return
				}
			}
		}
	}()

	// Goroutine 2: Read from WebSocket, write to PTY
	go func() {
		defer close(wsClosed)

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseNormalClosure) {
					wsLog.Debug("WebSocket read error: %v | pid=%d", err, info.pid)
				}
				return
			}

			var msg WSMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				wsLog.Debug("Invalid WebSocket message: %v", err)
				continue
			}

			switch msg.Type {
			case "input":
				if _, err := ptmx.Write([]byte(msg.Data)); err != nil {
					wsLog.Debug("PTY write failed: %v | pid=%d", err, info.pid)
					return
				}
			case "resize":
				if msg.Cols > 0 && msg.Rows > 0 {
					if err := pty.Setsize(ptmx, &pty.Winsize{
						Rows: uint16(msg.Rows),
						Cols: uint16(msg.Cols),
					}); err != nil {
						wsLog.Debug("Failed to resize PTY: %v | pid=%d", err, info.pid)
					}
				}
			case "ping":
				h.sendMessage(conn, info, WSMessage{Type: "pong"})
			}
		}
	}()

	// Goroutine 3: Send periodic pings
	pingTicker := time.NewTicker(PingInterval)
	defer pingTicker.Stop()

	go func() {
		for {
			select {
			case <-pingTicker.C:
				if err := h.sendPing(conn, info); err != nil {
					wsLog.Debug("Ping failed: %v | pid=%d", err, info.pid)
					return
				}
			case <-ptyClosed:
				return
			case <-wsClosed:
				return
			case <-ctx.Done():
				return
			}
		}
	}()

	// Wait for PTY process to exit or context to be cancelled
	cmdDone := make(chan error, 1)
	go func() {
		cmdDone <- cmd.Wait()
	}()

	var exitCode int
	select {
	case err := <-cmdDone:
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				wsLog.Error("Command wait error: %v | pid=%d", err, info.pid)
				exitCode = -1
			}
		}
	case <-ctx.Done():
		wsLog.Info("Connection timeout | pid=%d workspace=%s", info.pid, info.workspace)
		// Kill the process if context is cancelled
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		exitCode = -1
	case <-h.shutdownChan:
		wsLog.Info("Server shutdown, closing connection | pid=%d", info.pid)
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		exitCode = -1
	}

	// Close PTY to unblock read goroutine
	ptmx.Close()

	// Send exit message
	wsLog.Debug("PTY exited | pid=%d exitCode=%d", info.pid, exitCode)
	h.sendMessage(conn, info, WSMessage{Type: "exit", ExitCode: exitCode})

	// Send close message to WebSocket (protected by mutex)
	info.writeMu.Lock()
	conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	info.writeMu.Unlock()

	// Wait for goroutines with timeout
	select {
	case <-ptyClosed:
	case <-time.After(time.Second):
	}
	select {
	case <-wsClosed:
	case <-time.After(time.Second):
	}
}

// sendMessage sends a WebSocket message with proper error handling (thread-safe)
func (h *WSHandler) sendMessage(conn *websocket.Conn, info *connInfo, msg WSMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	info.writeMu.Lock()
	defer info.writeMu.Unlock()
	conn.SetWriteDeadline(time.Now().Add(WriteTimeout))
	return conn.WriteMessage(websocket.TextMessage, data)
}

// sendPing sends a ping message (thread-safe)
func (h *WSHandler) sendPing(conn *websocket.Conn, info *connInfo) error {
	info.writeMu.Lock()
	defer info.writeMu.Unlock()
	conn.SetWriteDeadline(time.Now().Add(WriteTimeout))
	return conn.WriteMessage(websocket.PingMessage, nil)
}

// ActiveConnections returns the number of active WebSocket connections
func (h *WSHandler) ActiveConnections() int {
	return int(atomic.LoadInt32(&h.activeConns))
}

// Shutdown gracefully shuts down all WebSocket connections
func (h *WSHandler) Shutdown(ctx context.Context) {
	close(h.shutdownChan)

	// Cancel all active connections
	h.connections.Range(func(key, value interface{}) bool {
		if info, ok := value.(*connInfo); ok {
			info.cancelFunc()
		}
		return true
	})

	// Wait for all connections to close or context timeout
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			wsLog.Warn("Shutdown timeout, %d connections still active", atomic.LoadInt32(&h.activeConns))
			return
		case <-ticker.C:
			if atomic.LoadInt32(&h.activeConns) == 0 {
				wsLog.Info("All WebSocket connections closed")
				return
			}
		}
	}
}

// ConnectionStats returns statistics about WebSocket connections
type ConnectionStats struct {
	ActiveConnections int                `json:"activeConnections"`
	MaxConnections    int                `json:"maxConnections"`
	Connections       []ConnectionDetail `json:"connections,omitempty"`
}

// ConnectionDetail contains details about a single connection
type ConnectionDetail struct {
	Workspace string `json:"workspace"`
	PID       int    `json:"pid"`
	Duration  string `json:"duration"`
}

// GetStats returns connection statistics
func (h *WSHandler) GetStats(includeDetails bool) ConnectionStats {
	stats := ConnectionStats{
		ActiveConnections: int(atomic.LoadInt32(&h.activeConns)),
		MaxConnections:    MaxConcurrentConnections,
	}

	if includeDetails {
		var details []ConnectionDetail
		h.connections.Range(func(key, value interface{}) bool {
			if info, ok := value.(*connInfo); ok {
				details = append(details, ConnectionDetail{
					Workspace: info.workspace,
					PID:       info.pid,
					Duration:  time.Since(info.startTime).Round(time.Second).String(),
				})
			}
			return true
		})
		stats.Connections = details
	}

	return stats
}
