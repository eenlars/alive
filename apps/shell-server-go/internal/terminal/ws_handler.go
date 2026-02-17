package terminal

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"

	"shell-server-go/internal/config"
	httpxmiddleware "shell-server-go/internal/httpx/middleware"
	"shell-server-go/internal/httpx/response"
	"shell-server-go/internal/logger"
	"shell-server-go/internal/session"
	workspacepkg "shell-server-go/internal/workspace"
)

const (
	// MaxConcurrentConnections is the maximum number of simultaneous WebSocket connections
	MaxConcurrentConnections = 50

	// WriteTimeout is the timeout for writing to WebSocket
	WriteTimeout = 10 * time.Second

	// PingInterval is how often to send ping messages
	PingInterval = 30 * time.Second

	// PongTimeout is how long to wait for pong response (5 min to survive brief internet outages)
	PongTimeout = 5 * time.Minute

	// PTYReadBufferSize is the buffer size for reading from PTY
	PTYReadBufferSize = 8192

	// WSLeaseTTL is the validity period for a WebSocket lease token
	WSLeaseTTL = 90 * time.Second

	// LatencySampleWindow limits latency sample memory while preserving stable percentiles.
	LatencySampleWindow = 2048
)

var wsLog = logger.WithComponent("WS")

// WSHandler handles WebSocket connections
type WSHandler struct {
	config           *config.AppConfig
	sessions         *session.Store
	resolver         *workspacepkg.Resolver
	leaseMu          sync.Mutex
	leases           map[string]WSLease
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
	latency    *wsLatencyTracker
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
	P50Ms    int64  `json:"p50Ms,omitempty"`
	P95Ms    int64  `json:"p95Ms,omitempty"`
	Samples  int    `json:"samples,omitempty"`
}

// WSLease is a one-time token that authorizes one WebSocket terminal upgrade.
type WSLease struct {
	SessionToken string
	Workspace    string
	Cwd          string
	RunAsOwner   bool
	ExpiresAt    time.Time
}

type latencySummary struct {
	Samples int
	P50     time.Duration
	P95     time.Duration
}

type wsLatencyTracker struct {
	mu      sync.Mutex
	pending []time.Time
	samples []time.Duration
}

func newWSLatencyTracker() *wsLatencyTracker {
	return &wsLatencyTracker{
		pending: make([]time.Time, 0, 256),
		samples: make([]time.Duration, 0, LatencySampleWindow),
	}
}

func (t *wsLatencyTracker) noteInput(ts time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.pending) >= LatencySampleWindow {
		copy(t.pending, t.pending[1:])
		t.pending = t.pending[:LatencySampleWindow-1]
	}
	t.pending = append(t.pending, ts)
}

func (t *wsLatencyTracker) noteOutput(ts time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.pending) == 0 {
		return
	}

	start := t.pending[0]
	t.pending = t.pending[1:]

	d := ts.Sub(start)
	if d < 0 || d > 10*time.Second {
		return
	}

	if len(t.samples) >= LatencySampleWindow {
		copy(t.samples, t.samples[1:])
		t.samples = t.samples[:LatencySampleWindow-1]
	}
	t.samples = append(t.samples, d)
}

func (t *wsLatencyTracker) summary() latencySummary {
	t.mu.Lock()
	defer t.mu.Unlock()

	if len(t.samples) == 0 {
		return latencySummary{}
	}

	sorted := make([]time.Duration, len(t.samples))
	copy(sorted, t.samples)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	return latencySummary{
		Samples: len(sorted),
		P50:     percentileDuration(sorted, 50),
		P95:     percentileDuration(sorted, 95),
	}
}

func percentileDuration(sorted []time.Duration, percentile int) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	if percentile <= 0 {
		return sorted[0]
	}
	if percentile >= 100 {
		return sorted[len(sorted)-1]
	}

	index := (percentile*(len(sorted)-1) + 50) / 100
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

// NewWSHandler creates a new WebSocket handler
func NewWSHandler(cfg *config.AppConfig, sessions *session.Store) *WSHandler {
	return &WSHandler{
		config:   cfg,
		sessions: sessions,
		resolver: workspacepkg.NewResolver(cfg),
		leases:   make(map[string]WSLease),
		upgrader: websocket.Upgrader{
			ReadBufferSize:    1024,
			WriteBufferSize:   1024,
			EnableCompression: false,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true // Allow connections without origin (like wscat)
				}
				host := r.Host
				if strings.Contains(origin, host) {
					return true
				}
				if strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1") {
					return true
				}
				// Allow cross-origin from web app (e.g. app.sonno.tech -> go.sonno.tech).
				baseDomain := extractBaseDomain(host)
				if baseDomain != "" && strings.Contains(origin, "."+baseDomain) {
					return true
				}
				wsLog.Warn("Rejected WebSocket origin: %s (host: %s)", origin, host)
				return false
			},
		},
		shutdownChan:     make(chan struct{}),
		shutdownComplete: make(chan struct{}),
	}
}

// CreateInternalLease issues a lease for the web app's terminal integration.
// Auth is via X-Internal-Secret (shared SHELL_PASSWORD), not browser cookies.
func (h *WSHandler) CreateInternalLease(w http.ResponseWriter, r *http.Request) {
	secret := r.Header.Get("X-Internal-Secret")
	if secret == "" || secret != h.config.ShellPassword {
		response.Error(w, http.StatusUnauthorized, "Invalid internal secret")
		return
	}

	var body struct {
		Workspace string `json:"workspace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	leaseToken, lease, err := h.createLease(internalLeaseSessionToken, body.Workspace)
	if err != nil {
		wsLog.Error("Failed to create internal lease | workspace=%s err=%v", body.Workspace, err)
		response.Error(w, http.StatusInternalServerError, "Failed to create terminal lease")
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"lease":     leaseToken,
		"workspace": lease.Workspace,
		"expiresAt": lease.ExpiresAt.UnixMilli(),
	})
}

// CreateLease issues a short-lived single-use token for a terminal WebSocket connection.
func (h *WSHandler) CreateLease(w http.ResponseWriter, r *http.Request) {
	if !httpxmiddleware.ParseFormRequest(w, r) {
		return
	}

	sessionToken := httpxmiddleware.GetSessionToken(r)
	if sessionToken == "" || !h.sessions.Valid(sessionToken) {
		response.Unauthorized(w)
		return
	}

	requestedWorkspace := workspacepkg.WorkspaceFromForm(r, h.sessions)

	leaseToken, lease, err := h.createLease(sessionToken, requestedWorkspace)
	if err != nil {
		var pathErr *workspacepkg.PathSecurityError
		switch {
		case errors.As(err, &pathErr):
			workspacepkg.HandlePathSecurityError(w, err)
		case os.IsNotExist(err):
			response.Error(w, http.StatusNotFound, "Workspace not found")
		default:
			wsLog.Error("Failed to create WS lease | workspace=%s err=%v", requestedWorkspace, err)
			response.Error(w, http.StatusInternalServerError, "Failed to create terminal lease")
		}
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"lease":     leaseToken,
		"workspace": lease.Workspace,
		"expiresAt": lease.ExpiresAt.UnixMilli(),
	})
}

// internalLeaseSessionToken is the sentinel value used for leases created via
// the internal API (POST /internal/lease). These leases are consumed without a
// browser cookie because the web app already validated the user session.
const internalLeaseSessionToken = "internal"

// Handle handles WebSocket connections
func (h *WSHandler) Handle(w http.ResponseWriter, r *http.Request) {
	// Determine session token: cookie-based (shell-server UI) or internal lease.
	sessionToken := httpxmiddleware.GetSessionToken(r)
	if sessionToken == "" {
		// No cookie — only allow if the lease was issued internally.
		// Use the sentinel so consumeLease matches internal leases.
		sessionToken = internalLeaseSessionToken
	} else if !h.sessions.Valid(sessionToken) {
		response.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Check connection limit
	currentConns := atomic.LoadInt32(&h.activeConns)
	if currentConns >= MaxConcurrentConnections {
		wsLog.Warn("Connection rejected: max connections reached (%d)", currentConns)
		response.Error(w, http.StatusServiceUnavailable, "Too many connections")
		return
	}

	leaseToken := strings.TrimSpace(r.URL.Query().Get("lease"))
	workspace, cwd, runAsOwner, err := h.consumeLease(sessionToken, leaseToken)
	if err != nil {
		wsLog.Warn("Lease rejected: %v", err)
		response.Error(w, http.StatusUnauthorized, "Invalid or expired lease")
		return
	}

	// Re-validate workspace boundary (defense-in-depth) for site workspaces.
	// Root workspace is intentionally outside sitesPath and should not be validated here.
	if runAsOwner {
		if err := workspacepkg.ValidateSiteWorkspaceBoundary(cwd, h.config.ResolvedSitesPath); err != nil {
			wsLog.Warn("Workspace boundary re-validation failed: %v", err)
			response.Error(w, http.StatusForbidden, "Invalid workspace")
			return
		}
	}

	// Validate workspace directory exists and is a directory
	dirInfo, err := os.Stat(cwd)
	if os.IsNotExist(err) {
		wsLog.Error("Workspace directory does not exist: %s", cwd)
		response.Error(w, http.StatusNotFound, "Workspace not found")
		return
	}
	if err != nil {
		wsLog.Error("Failed to stat workspace directory %s: %v", cwd, err)
		response.Error(w, http.StatusInternalServerError, "Failed to access workspace")
		return
	}
	if !dirInfo.IsDir() {
		wsLog.Warn("Workspace path is not a directory: %s", cwd)
		response.Error(w, http.StatusBadRequest, "Invalid workspace")
		return
	}

	credential, err := h.resolveWorkspaceCredential(cwd, runAsOwner)
	if err != nil {
		wsLog.Error("Failed to resolve workspace credential | workspace=%s cwd=%s err=%v", workspace, cwd, err)
		response.Error(w, http.StatusForbidden, "Workspace terminal unavailable")
		return
	}

	// Ensure proxy chain preserves websocket stream behavior.
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Cache-Control", "no-cache, no-transform")

	// Upgrade connection
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		wsLog.Error("WebSocket upgrade failed: %v", err)
		return
	}

	conn.EnableWriteCompression(false)

	// Track connection
	atomic.AddInt32(&h.activeConns, 1)
	defer atomic.AddInt32(&h.activeConns, -1)

	// Keep terminal session persistent until explicit disconnect/shutdown.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Store connection info
	info := &connInfo{
		workspace:  workspace,
		startTime:  time.Now(),
		cancelFunc: cancel,
		latency:    newWSLatencyTracker(),
	}
	h.connections.Store(conn, info)
	defer h.connections.Delete(conn)

	wsLog.Info("Connection opened | workspace=%s cwd=%s remoteAddr=%s", workspace, cwd, r.RemoteAddr)

	// Run the PTY session
	h.runPTYSession(ctx, conn, cwd, credential, runAsOwner, info)
}

// runPTYSession manages a PTY session over WebSocket
func (h *WSHandler) runPTYSession(
	ctx context.Context,
	conn *websocket.Conn,
	cwd string,
	credential *syscall.Credential,
	runAsOwner bool,
	info *connInfo,
) {
	// Ensure connection is closed when we exit
	defer func() {
		conn.Close()
		summary := info.latency.summary()
		if summary.Samples > 0 {
			wsLog.Info(
				"Connection closed | workspace=%s duration=%v latency_samples=%d latency_p50_ms=%d latency_p95_ms=%d",
				info.workspace,
				time.Since(info.startTime),
				summary.Samples,
				summary.P50.Milliseconds(),
				summary.P95.Milliseconds(),
			)
			return
		}
		wsLog.Info("Connection closed | workspace=%s duration=%v", info.workspace, time.Since(info.startTime))
	}()

	// Start shell
	shell := "/bin/bash"
	cmd := exec.CommandContext(ctx, shell)
	cmd.Dir = cwd
	if credential != nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{Credential: credential}
	}

	// Set environment with TERM=xterm-256color for color support
	env := os.Environ()
	filteredEnv := make([]string, 0, len(env)+2)
	for _, e := range env {
		if !strings.HasPrefix(e, "TERM=") && !(runAsOwner && strings.HasPrefix(e, "HOME=")) {
			filteredEnv = append(filteredEnv, e)
		}
	}
	filteredEnv = append(filteredEnv, "TERM=xterm-256color")
	if runAsOwner {
		// Keep shell history/config local to the workspace user directory.
		filteredEnv = append(filteredEnv, "HOME="+cwd)
	}
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
				info.latency.noteOutput(time.Now())
				if err := h.sendBinary(conn, info, buf[:n]); err != nil {
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
			msgType, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseNormalClosure) {
					wsLog.Debug("WebSocket read error: %v | pid=%d", err, info.pid)
				}
				return
			}

			if msgType == websocket.BinaryMessage {
				if len(message) == 0 {
					continue
				}
				if _, err := ptmx.Write(message); err != nil {
					wsLog.Debug("PTY write failed: %v | pid=%d", err, info.pid)
					return
				}
				info.latency.noteInput(time.Now())
				continue
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
				info.latency.noteInput(time.Now())
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
	case <-wsClosed:
		wsLog.Debug("WebSocket closed by client | pid=%d workspace=%s", info.pid, info.workspace)
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		exitCode = -1
	case <-ctx.Done():
		// Kill the process if context is cancelled.
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

// sendBinary sends raw PTY bytes with minimal framing overhead (thread-safe).
func (h *WSHandler) sendBinary(conn *websocket.Conn, info *connInfo, payload []byte) error {
	info.writeMu.Lock()
	defer info.writeMu.Unlock()
	conn.SetWriteDeadline(time.Now().Add(WriteTimeout))
	return conn.WriteMessage(websocket.BinaryMessage, payload)
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

	h.leaseMu.Lock()
	h.leases = make(map[string]WSLease)
	h.leaseMu.Unlock()

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
	Workspace      string `json:"workspace"`
	PID            int    `json:"pid"`
	Duration       string `json:"duration"`
	LatencySamples int    `json:"latencySamples,omitempty"`
	KeypressP50Ms  int64  `json:"keypressP50Ms,omitempty"`
	KeypressP95Ms  int64  `json:"keypressP95Ms,omitempty"`
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
				summary := info.latency.summary()
				details = append(details, ConnectionDetail{
					Workspace:      info.workspace,
					PID:            info.pid,
					Duration:       time.Since(info.startTime).Round(time.Second).String(),
					LatencySamples: summary.Samples,
					KeypressP50Ms:  summary.P50.Milliseconds(),
					KeypressP95Ms:  summary.P95.Milliseconds(),
				})
			}
			return true
		})
		stats.Connections = details
	}

	return stats
}

func (h *WSHandler) createLease(sessionToken, workspaceQuery string) (string, WSLease, error) {
	workspace, cwd, runAsOwner, err := h.resolveShellWorkspace(workspaceQuery)
	if err != nil {
		return "", WSLease{}, err
	}

	// Validate workspace is still available at lease-issuance time.
	dirInfo, err := os.Stat(cwd)
	if err != nil {
		return "", WSLease{}, err
	}
	if !dirInfo.IsDir() {
		return "", WSLease{}, &workspacepkg.PathSecurityError{
			Op:      "lease_workspace_not_dir",
			Path:    cwd,
			Wrapped: workspacepkg.ErrInvalidPath,
		}
	}

	// If this workspace should run as owner, verify we can resolve credentials now.
	if _, err := h.resolveWorkspaceCredential(cwd, runAsOwner); err != nil {
		return "", WSLease{}, err
	}

	token, err := generateLeaseToken()
	if err != nil {
		return "", WSLease{}, fmt.Errorf("generate lease token: %w", err)
	}

	lease := WSLease{
		SessionToken: sessionToken,
		Workspace:    workspace,
		Cwd:          cwd,
		RunAsOwner:   runAsOwner,
		ExpiresAt:    time.Now().Add(WSLeaseTTL),
	}

	h.leaseMu.Lock()
	defer h.leaseMu.Unlock()
	h.pruneExpiredLeasesLocked(time.Now())
	h.leases[token] = lease

	return token, lease, nil
}

func (h *WSHandler) consumeLease(sessionToken, token string) (workspace string, cwd string, runAsOwner bool, err error) {
	if strings.TrimSpace(token) == "" {
		return "", "", false, ErrMissingLease
	}

	now := time.Now()

	h.leaseMu.Lock()
	lease, ok := h.leases[token]
	if ok {
		// Single-use: remove immediately once presented, regardless of outcome.
		delete(h.leases, token)
	}
	h.pruneExpiredLeasesLocked(now)
	h.leaseMu.Unlock()

	if !ok {
		return "", "", false, ErrInvalidLease
	}
	if now.After(lease.ExpiresAt) {
		return "", "", false, ErrExpiredLease
	}
	if lease.SessionToken != sessionToken {
		return "", "", false, ErrLeaseSessionDenied
	}

	return lease.Workspace, lease.Cwd, lease.RunAsOwner, nil
}

func (h *WSHandler) pruneExpiredLeasesLocked(now time.Time) {
	for token, lease := range h.leases {
		if now.After(lease.ExpiresAt) {
			delete(h.leases, token)
		}
	}
}

func generateLeaseToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// extractBaseDomain returns the registrable base domain from a host string.
// e.g. "go.sonno.tech" → "sonno.tech", "go.alive.best:8443" → "alive.best".
// Returns "" if the host has fewer than 2 labels.
func extractBaseDomain(host string) string {
	// Strip port if present
	if idx := strings.LastIndex(host, ":"); idx != -1 {
		host = host[:idx]
	}
	parts := strings.Split(host, ".")
	if len(parts) < 2 {
		return ""
	}
	return parts[len(parts)-2] + "." + parts[len(parts)-1]
}

func (h *WSHandler) resolveShellWorkspace(workspaceQuery string) (workspace string, cwd string, runAsOwner bool, err error) {
	workspace = strings.TrimSpace(workspaceQuery)
	if workspace == "" || workspace == "root" {
		return "root", h.config.ResolvedDefaultCwd, false, nil
	}

	// Backward compatible input:
	// - site:example.com
	// - example.com
	siteWorkspace := workspace
	if !strings.HasPrefix(siteWorkspace, "site:") {
		siteWorkspace = "site:" + siteWorkspace
	}

	cwd, err = h.resolver.ResolveWorkspaceBase(siteWorkspace)
	if err != nil {
		return "", "", false, err
	}

	if err := workspacepkg.ValidateSiteWorkspaceBoundary(cwd, h.config.ResolvedSitesPath); err != nil {
		return "", "", false, err
	}

	return siteWorkspace, cwd, true, nil
}

func (h *WSHandler) resolveWorkspaceCredential(cwd string, runAsOwner bool) (*syscall.Credential, error) {
	if !runAsOwner {
		return nil, nil
	}

	info, err := os.Stat(cwd)
	if err != nil {
		return nil, fmt.Errorf("stat workspace: %w", err)
	}

	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return nil, fmt.Errorf("workspace stat does not expose uid/gid")
	}

	currentUID := os.Geteuid()
	currentGID := os.Getegid()
	targetUID := int(stat.Uid)
	targetGID := int(stat.Gid)

	if currentUID == targetUID && currentGID == targetGID {
		return nil, nil
	}

	if currentUID != 0 {
		return nil, fmt.Errorf("cannot switch uid/gid without root (current=%d:%d target=%d:%d)", currentUID, currentGID, targetUID, targetGID)
	}

	return &syscall.Credential{
		Uid:         stat.Uid,
		Gid:         stat.Gid,
		NoSetGroups: true,
	}, nil
}
