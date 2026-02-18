package main

import (
	"archive/zip"
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/gorilla/websocket"

	"shell-server-go/internal/auth"
	"shell-server-go/internal/config"
	"shell-server-go/internal/editor"
	"shell-server-go/internal/files"
	"shell-server-go/internal/logger"
	"shell-server-go/internal/middleware"
	"shell-server-go/internal/ratelimit"
	"shell-server-go/internal/session"
	"shell-server-go/internal/templates"
	"shell-server-go/internal/terminal"
)

// testServer holds the test server and dependencies
type testServer struct {
	server       *httptest.Server
	sessions     *session.Store
	wsHandler    *terminal.WSHandler
	config       *config.AppConfig
	tempDir      string
	sessionsFile string
}

// setupTestServer creates a fully configured test server
func setupTestServer(t *testing.T) *testServer {
	t.Helper()

	// Initialize logger for tests
	logger.Init(logger.Config{
		Output:   io.Discard, // Suppress logs in tests
		MinLevel: logger.ERROR,
		UseColor: false,
	})

	// Create temp directories
	tempDir, err := os.MkdirTemp("", "shell-server-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	workspaceDir := filepath.Join(tempDir, "workspace")
	sitesDir := filepath.Join(tempDir, "sites")
	uploadsDir := filepath.Join(tempDir, "uploads")

	for _, dir := range []string{workspaceDir, sitesDir, uploadsDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("Failed to create dir %s: %v", dir, err)
		}
	}

	// Create test config
	cfg := &config.AppConfig{
		Env:                     "test",
		Port:                    0, // Will use random port
		DefaultWorkspace:        "root",
		ResolvedDefaultCwd:      workspaceDir,
		ResolvedUploadCwd:       uploadsDir,
		ResolvedSitesPath:       sitesDir,
		WorkspaceBase:           tempDir,
		AllowWorkspaceSelection: true,
		EditableDirectories:     []config.EditableDirectory{},
		ShellPassword:           "testpassword123",
	}

	// Initialize session store
	sessionsFile := filepath.Join(tempDir, ".sessions.json")
	sessions := session.NewStore(sessionsFile)

	// Initialize rate limiter
	rateLimitFile := filepath.Join(tempDir, ".rate-limit-state.json")
	limiter := ratelimit.NewLimiter(rateLimitFile)

	// Create handlers
	authHandler := auth.NewHandler(cfg, sessions, limiter)
	fileHandler := files.NewHandler(cfg, sessions)
	editorHandler := editor.NewHandler(cfg, sessions)
	wsHandler := terminal.NewWSHandler(cfg, sessions)
	templateHandler := templates.NewHandler(cfg, sessions)

	// Create in-memory client filesystem for SPA (minimal for tests)
	clientFS := fstest.MapFS{
		"index.html": {Data: []byte(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`)},
	}

	// Create router
	mux := http.NewServeMux()
	authAPIMiddleware := middleware.AuthAPI(sessions)

	// Auth routes
	mux.HandleFunc("POST /login", authHandler.Login)
	mux.HandleFunc("/logout", authHandler.Logout)

	// Config API
	mux.Handle("GET /api/config", authAPIMiddleware(http.HandlerFunc(fileHandler.Config)))

	// Health check
	mux.HandleFunc("/health", fileHandler.Health)

	// WebSocket
	mux.HandleFunc("/ws", wsHandler.Handle)
	mux.Handle("POST /api/ws-lease", authAPIMiddleware(http.HandlerFunc(wsHandler.CreateLease)))

	// File APIs
	mux.Handle("POST /api/list-files", authAPIMiddleware(http.HandlerFunc(fileHandler.ListFiles)))
	mux.Handle("POST /api/check-directory", authAPIMiddleware(http.HandlerFunc(fileHandler.CheckDirectory)))
	mux.Handle("POST /api/create-directory", authAPIMiddleware(http.HandlerFunc(fileHandler.CreateDirectory)))
	mux.Handle("POST /api/upload", authAPIMiddleware(http.HandlerFunc(fileHandler.Upload)))
	mux.Handle("POST /api/read-file", authAPIMiddleware(http.HandlerFunc(fileHandler.ReadFile)))
	mux.Handle("GET /api/download-file", authAPIMiddleware(http.HandlerFunc(fileHandler.DownloadFile)))
	mux.Handle("POST /api/delete-folder", authAPIMiddleware(http.HandlerFunc(fileHandler.DeleteFolder)))
	mux.Handle("GET /api/sites", authAPIMiddleware(http.HandlerFunc(fileHandler.ListSites)))

	// Editor APIs
	mux.Handle("POST /api/edit/list-files", authAPIMiddleware(http.HandlerFunc(editorHandler.ListFiles)))
	mux.Handle("POST /api/edit/read-file", authAPIMiddleware(http.HandlerFunc(editorHandler.ReadFile)))
	mux.Handle("POST /api/edit/write-file", authAPIMiddleware(http.HandlerFunc(editorHandler.WriteFile)))
	mux.Handle("POST /api/edit/check-mtimes", authAPIMiddleware(http.HandlerFunc(editorHandler.CheckMtimes)))
	mux.Handle("POST /api/edit/delete", authAPIMiddleware(http.HandlerFunc(editorHandler.Delete)))
	mux.Handle("POST /api/edit/copy", authAPIMiddleware(http.HandlerFunc(editorHandler.Copy)))

	// Templates APIs
	mux.Handle("GET /api/templates", authAPIMiddleware(http.HandlerFunc(templateHandler.ListTemplates)))
	mux.Handle("POST /api/templates", authAPIMiddleware(http.HandlerFunc(templateHandler.CreateTemplate)))
	mux.Handle("GET /api/templates/{id}", authAPIMiddleware(http.HandlerFunc(templateHandler.GetTemplate)))
	mux.Handle("PUT /api/templates/{id}", authAPIMiddleware(http.HandlerFunc(templateHandler.SaveTemplate)))

	// SPA handler
	spaHandler := createTestSPAHandler(clientFS)
	mux.Handle("/", spaHandler)

	// Use TLS server so Secure cookies work
	server := httptest.NewTLSServer(mux)

	return &testServer{
		server:       server,
		sessions:     sessions,
		wsHandler:    wsHandler,
		config:       cfg,
		tempDir:      tempDir,
		sessionsFile: sessionsFile,
	}
}

// createTestSPAHandler creates a SPA handler for tests
func createTestSPAHandler(clientFS fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		indexFile, err := fs.ReadFile(clientFS, "index.html")
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexFile)
	})
}

// cleanup removes temp files and stops the server
func (ts *testServer) cleanup() {
	ts.server.Close()
	ts.sessions.Stop()
	os.RemoveAll(ts.tempDir)
}

// login authenticates and returns a cookie jar with session
func (ts *testServer) login(t *testing.T) *cookiejar.Jar {
	return ts.loginWithWorkspace(t, "")
}

func (ts *testServer) loginWithWorkspace(t *testing.T, workspace string) *cookiejar.Jar {
	t.Helper()

	jar, _ := cookiejar.New(nil)

	// Don't follow redirects - we want to capture the Set-Cookie header
	// Skip TLS verification for test server
	client := &http.Client{
		Jar: jar,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	values := url.Values{}
	values.Set("password", ts.config.ShellPassword)
	if strings.TrimSpace(workspace) != "" {
		values.Set("workspace", workspace)
	}

	resp, err := client.Post(ts.server.URL+"/login", "application/x-www-form-urlencoded", strings.NewReader(values.Encode()))
	if err != nil {
		t.Fatalf("Login request failed: %v", err)
	}
	defer resp.Body.Close()

	// Should redirect to dashboard on success (303 See Other)
	if resp.StatusCode != http.StatusSeeOther {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("Login failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Check response Set-Cookie header directly
	setCookie := resp.Header.Get("Set-Cookie")
	if setCookie == "" {
		t.Fatalf("No Set-Cookie header in login response")
	}
	t.Logf("Set-Cookie header: %s", setCookie)

	// Manually set the cookie on the jar since httptest can have issues
	serverURL, _ := url.Parse(ts.server.URL)
	jar.SetCookies(serverURL, resp.Cookies())

	// Verify we got the session cookie
	cookies := jar.Cookies(serverURL)
	hasSession := false
	for _, c := range cookies {
		if c.Name == "shell_session" {
			hasSession = true
			t.Logf("Got session cookie: %s...", c.Value[:16])
			break
		}
	}
	if !hasSession {
		t.Fatalf("No session cookie received after login. Cookies: %v", cookies)
	}

	return jar
}

// ==============================================================================
// TEST 1: WebSocket Terminal Session E2E
// ==============================================================================
// This test validates the complete terminal flow:
// 1. Authentication via login
// 2. WebSocket upgrade with session cookie
// 3. PTY session creation and "connected" message
// 4. Sending a command and receiving output
// 5. Graceful disconnection
// ==============================================================================

func TestE2E_WebSocketTerminalSession(t *testing.T) {
	ts := setupTestServer(t)
	defer ts.cleanup()

	// Step 1: Login and get session
	jar := ts.login(t)
	client := createTLSClient(jar)
	cookieHeader := buildCookieHeader(jar, ts.server.URL)

	lease, _, err := createWSLease(client, ts.server.URL, "root")
	if err != nil {
		t.Fatalf("Failed to create WS lease: %v", err)
	}

	// Step 2: Connect WebSocket with session cookie
	conn, resp, err := dialWS(ts.server.URL, lease, cookieHeader)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v (response: %v)", err, resp)
	}
	defer conn.Close()

	// Step 3: Expect "connected" message
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	msgType, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read connected message: %v", err)
	}
	if msgType != websocket.TextMessage {
		t.Fatalf("Expected connected control frame as text, got frame type %d", msgType)
	}

	var connectedMsg map[string]interface{}
	if err := json.Unmarshal(msg, &connectedMsg); err != nil {
		t.Fatalf("Failed to parse connected message: %v", err)
	}
	if connectedMsg["type"] == "error" {
		if message, ok := connectedMsg["message"].(string); ok && strings.Contains(message, "Failed to start shell") {
			t.Skipf("Skipping PTY-dependent test in restricted environment: %s", message)
		}
	}
	if connectedMsg["type"] != "connected" {
		t.Fatalf("Expected 'connected' message, got: %s", string(msg))
	}
	t.Log("Received 'connected' message from PTY")

	// Step 4: Send a command and wait for output
	testCommand := "echo HELLO_E2E_TEST\n"
	if err := conn.WriteMessage(websocket.BinaryMessage, []byte(testCommand)); err != nil {
		t.Fatalf("Failed to send command: %v", err)
	}

	// Read output until we see our marker or timeout
	foundOutput := false
	deadline := time.Now().Add(10 * time.Second)
	var allOutput strings.Builder

	for time.Now().Before(deadline) {
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			// Timeout is OK, we might have all output
			break
		}

		if msgType == websocket.BinaryMessage {
			allOutput.Write(msg)
			if strings.Contains(allOutput.String(), "HELLO_E2E_TEST") {
				foundOutput = true
				break
			}
			continue
		}

		var dataMsg map[string]interface{}
		if err := json.Unmarshal(msg, &dataMsg); err != nil {
			continue
		}
		if dataMsg["type"] == "data" {
			if data, ok := dataMsg["data"].(string); ok {
				allOutput.WriteString(data)
				if strings.Contains(allOutput.String(), "HELLO_E2E_TEST") {
					foundOutput = true
					break
				}
			}
		}
	}

	if !foundOutput {
		t.Fatalf("Did not receive expected output 'HELLO_E2E_TEST'. Got: %s", allOutput.String())
	}
	t.Log("Command executed successfully, received expected output")

	// Step 5: Test resize
	resizeMsg := map[string]interface{}{"type": "resize", "cols": 120, "rows": 40}
	resizeBytes, _ := json.Marshal(resizeMsg)
	if err := conn.WriteMessage(websocket.TextMessage, resizeBytes); err != nil {
		t.Fatalf("Failed to send resize: %v", err)
	}
	t.Log("Resize message sent successfully")

	// Step 6: Send exit and verify clean disconnect
	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("exit\n")); err != nil {
		t.Fatalf("Failed to send exit: %v", err)
	}

	// Wait for exit message
	exitReceived := false
	for i := 0; i < 10; i++ {
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if msgType == websocket.BinaryMessage {
			continue
		}
		var exitRespMsg map[string]interface{}
		if err := json.Unmarshal(msg, &exitRespMsg); err != nil {
			continue
		}
		if exitRespMsg["type"] == "exit" {
			exitReceived = true
			t.Logf("Received exit message with code: %v", exitRespMsg["exitCode"])
			break
		}
	}

	if !exitReceived {
		t.Log("Warning: Did not receive explicit exit message (may have closed cleanly)")
	}

	t.Log("WebSocket terminal session E2E test PASSED")
}

// ==============================================================================
// TEST 2: WebSocket Workspace Security E2E
// ==============================================================================
// This test validates workspace resolution and path containment in WS flow:
// 1. Invalid workspace traversal is rejected at handshake
// 2. Site workspace resolves to /sites/<domain>/user
// 3. Legacy workspace=<domain> still works (backward compatibility)
// ==============================================================================

func TestE2E_WebSocketWorkspaceSecurity(t *testing.T) {
	ts := setupTestServer(t)
	defer ts.cleanup()

	jar := ts.login(t)
	client := createTLSClient(jar)
	cookieHeader := buildCookieHeader(jar, ts.server.URL)

	t.Run("rejects traversal workspace", func(t *testing.T) {
		_, resp, err := createWSLease(client, ts.server.URL, "../../../etc")
		if err == nil {
			t.Fatalf("Expected lease creation to fail for traversal workspace")
		}
		if resp == nil || resp.StatusCode != http.StatusBadRequest {
			got := -1
			if resp != nil {
				got = resp.StatusCode
			}
			t.Fatalf("Expected 400 for invalid workspace lease request, got %d", got)
		}
	})

	siteUserDir := filepath.Join(ts.config.ResolvedSitesPath, "example.com", "user")
	if err := os.MkdirAll(siteUserDir, 0755); err != nil {
		t.Fatalf("Failed to create site user directory: %v", err)
	}

	for _, ws := range []string{"site:example.com", "example.com"} {
		t.Run("site workspace "+ws, func(t *testing.T) {
			lease, _, err := createWSLease(client, ts.server.URL, ws)
			if err != nil {
				t.Fatalf("Failed to create WS lease for %s: %v", ws, err)
			}

			conn, resp, err := dialWS(ts.server.URL, lease, cookieHeader)
			if err != nil {
				t.Fatalf("WS dial failed for workspace %s: %v (response: %v)", ws, err, resp)
			}
			defer conn.Close()

			conn.SetReadDeadline(time.Now().Add(5 * time.Second))
			msgType, firstMsg, err := conn.ReadMessage()
			if err != nil {
				t.Fatalf("Failed to read first WS message for %s: %v", ws, err)
			}
			if msgType != websocket.TextMessage {
				t.Fatalf("Expected first WS control frame as text for %s, got type=%d", ws, msgType)
			}
			var first map[string]interface{}
			if err := json.Unmarshal(firstMsg, &first); err != nil {
				t.Fatalf("Failed to parse first WS message for %s: %v", ws, err)
			}
			if first["type"] == "error" {
				if message, ok := first["message"].(string); ok && strings.Contains(message, "Failed to start shell") {
					t.Skipf("Skipping PTY-dependent test in restricted environment: %s", message)
				}
			}
			if first["type"] != "connected" {
				t.Fatalf("Did not receive connected event for workspace %s", ws)
			}

			if err := conn.WriteMessage(websocket.BinaryMessage, []byte("pwd\n")); err != nil {
				t.Fatalf("Failed to send pwd command: %v", err)
			}

			foundUserDir := false
			deadline := time.Now().Add(10 * time.Second)
			var output strings.Builder

			for time.Now().Before(deadline) {
				conn.SetReadDeadline(time.Now().Add(2 * time.Second))
				msgType, msg, err := conn.ReadMessage()
				if err != nil {
					break
				}
				if msgType == websocket.BinaryMessage {
					output.Write(msg)
					if strings.Contains(output.String(), siteUserDir) {
						foundUserDir = true
						break
					}
					continue
				}
				var wsMsg map[string]interface{}
				if err := json.Unmarshal(msg, &wsMsg); err != nil {
					continue
				}
				if wsMsg["type"] == "data" {
					if data, ok := wsMsg["data"].(string); ok {
						output.WriteString(data)
						if strings.Contains(output.String(), siteUserDir) {
							foundUserDir = true
							break
						}
					}
				}
			}

			if !foundUserDir {
				t.Fatalf("Expected terminal to run in %s, got output: %q", siteUserDir, output.String())
			}

			_ = conn.WriteMessage(websocket.BinaryMessage, []byte("exit\n"))
		})
	}

	t.Run("lease is single-use", func(t *testing.T) {
		lease, _, err := createWSLease(client, ts.server.URL, "root")
		if err != nil {
			t.Fatalf("Failed to create root lease: %v", err)
		}

		conn, resp, err := dialWS(ts.server.URL, lease, cookieHeader)
		if err != nil {
			t.Fatalf("First WS dial with lease should succeed, got err=%v resp=%v", err, resp)
		}
		conn.Close()

		conn2, resp2, err2 := dialWS(ts.server.URL, lease, cookieHeader)
		if conn2 != nil {
			conn2.Close()
		}
		if err2 == nil {
			t.Fatalf("Expected second WS dial with same lease to fail")
		}
		if resp2 == nil || resp2.StatusCode != http.StatusUnauthorized {
			got := -1
			if resp2 != nil {
				got = resp2.StatusCode
			}
			t.Fatalf("Expected 401 for reused lease, got %d", got)
		}
	})
}

// ==============================================================================
// TEST 3: Session-Scoped Workspace Enforcement
// ==============================================================================
// This test validates that a login-scoped workspace cannot be overridden:
// 1. Login pins session to a specific site workspace
// 2. WS lease ignores conflicting workspace request values
// 3. File API workspace params are overridden by the pinned workspace
// 4. Site listing is restricted to the pinned site
// ==============================================================================

func TestE2E_SessionScopedWorkspaceEnforcement(t *testing.T) {
	ts := setupTestServer(t)
	defer ts.cleanup()

	siteUserDir := filepath.Join(ts.config.ResolvedSitesPath, "example.com", "user")
	if err := os.MkdirAll(siteUserDir, 0755); err != nil {
		t.Fatalf("Failed to create pinned site directory: %v", err)
	}
	otherSiteUserDir := filepath.Join(ts.config.ResolvedSitesPath, "other.com", "user")
	if err := os.MkdirAll(otherSiteUserDir, 0755); err != nil {
		t.Fatalf("Failed to create secondary site directory: %v", err)
	}

	jar := ts.loginWithWorkspace(t, "site:example.com")
	client := createTLSClient(jar)

	t.Run("config reflects pinned workspace", func(t *testing.T) {
		req, _ := http.NewRequest("GET", ts.server.URL+"/api/config", nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Config request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/config, got %d: %s", resp.StatusCode, string(body))
		}

		var payload struct {
			DefaultWorkspace        string `json:"defaultWorkspace"`
			AllowWorkspaceSelection bool   `json:"allowWorkspaceSelection"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("Decode /api/config response: %v", err)
		}

		if payload.DefaultWorkspace != "site:example.com" {
			t.Fatalf("Expected defaultWorkspace site:example.com, got %q", payload.DefaultWorkspace)
		}
		if payload.AllowWorkspaceSelection {
			t.Fatalf("Expected allowWorkspaceSelection=false for pinned session")
		}
	})

	t.Run("ws lease ignores conflicting workspace request", func(t *testing.T) {
		body := strings.NewReader("workspace=" + url.QueryEscape("site:other.com"))
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/ws-lease", body)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("WS lease request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			responseBody, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/ws-lease, got %d: %s", resp.StatusCode, string(responseBody))
		}

		var payload struct {
			Lease     string `json:"lease"`
			Workspace string `json:"workspace"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("Decode /api/ws-lease response: %v", err)
		}
		if payload.Lease == "" {
			t.Fatalf("Expected lease token in response")
		}
		if payload.Workspace != "site:example.com" {
			t.Fatalf("Expected pinned workspace in lease response, got %q", payload.Workspace)
		}
	})

	t.Run("file listing uses pinned workspace regardless of request workspace", func(t *testing.T) {
		form := strings.NewReader("workspace=root")
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/list-files", form)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("List files request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/list-files, got %d: %s", resp.StatusCode, string(body))
		}

		var payload struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("Decode /api/list-files response: %v", err)
		}
		if payload.Path != siteUserDir {
			t.Fatalf("Expected pinned path %q, got %q", siteUserDir, payload.Path)
		}
	})

	t.Run("upload uses pinned workspace regardless of request workspace", func(t *testing.T) {
		var formBuf bytes.Buffer
		formWriter := multipart.NewWriter(&formBuf)
		formWriter.WriteField("workspace", "root")
		formWriter.WriteField("targetDir", "scoped-upload")

		part, err := formWriter.CreateFormFile("file", "scoped.txt")
		if err != nil {
			t.Fatalf("Failed to create upload part: %v", err)
		}
		part.Write([]byte("scoped upload content"))
		formWriter.Close()

		req, _ := http.NewRequest("POST", ts.server.URL+"/api/upload", &formBuf)
		req.Header.Set("Content-Type", formWriter.FormDataContentType())
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Upload request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/upload, got %d: %s", resp.StatusCode, string(body))
		}

		pinnedPath := filepath.Join(siteUserDir, "scoped-upload", "scoped.txt")
		content, err := os.ReadFile(pinnedPath)
		if err != nil {
			t.Fatalf("Expected uploaded file in pinned workspace %q: %v", pinnedPath, err)
		}
		if string(content) != "scoped upload content" {
			t.Fatalf("Unexpected uploaded file content in pinned workspace: %q", string(content))
		}

		outsidePath := filepath.Join(ts.config.ResolvedUploadCwd, "scoped-upload", "scoped.txt")
		if _, err := os.Stat(outsidePath); !os.IsNotExist(err) {
			t.Fatalf("Upload escaped pinned workspace, found unexpected file at %q", outsidePath)
		}
	})

	t.Run("read-file ignores conflicting workspace parameter", func(t *testing.T) {
		relativePath := filepath.Join("scoped-read", "file.txt")
		pinnedReadPath := filepath.Join(siteUserDir, relativePath)
		outsideReadPath := filepath.Join(ts.config.ResolvedUploadCwd, relativePath)

		if err := os.MkdirAll(filepath.Dir(pinnedReadPath), 0755); err != nil {
			t.Fatalf("Failed to create pinned read directory: %v", err)
		}
		if err := os.MkdirAll(filepath.Dir(outsideReadPath), 0755); err != nil {
			t.Fatalf("Failed to create outside read directory: %v", err)
		}

		if err := os.WriteFile(pinnedReadPath, []byte("pinned-read"), 0644); err != nil {
			t.Fatalf("Failed to write pinned read file: %v", err)
		}
		if err := os.WriteFile(outsideReadPath, []byte("outside-read"), 0644); err != nil {
			t.Fatalf("Failed to write outside read file: %v", err)
		}

		form := strings.NewReader("workspace=root&path=" + url.QueryEscape(filepath.ToSlash(relativePath)))
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/read-file", form)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Read request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/read-file, got %d: %s", resp.StatusCode, string(body))
		}

		var payload struct {
			Content string `json:"content"`
			Path    string `json:"path"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("Decode /api/read-file response: %v", err)
		}
		if payload.Content != "pinned-read" {
			t.Fatalf("Expected pinned file content, got %q", payload.Content)
		}
		if payload.Path != pinnedReadPath {
			t.Fatalf("Expected pinned path %q, got %q", pinnedReadPath, payload.Path)
		}
	})

	t.Run("download-file ignores conflicting workspace parameter", func(t *testing.T) {
		relativePath := filepath.Join("scoped-download", "file.txt")
		pinnedDownloadPath := filepath.Join(siteUserDir, relativePath)
		outsideDownloadPath := filepath.Join(ts.config.ResolvedUploadCwd, relativePath)

		if err := os.MkdirAll(filepath.Dir(pinnedDownloadPath), 0755); err != nil {
			t.Fatalf("Failed to create pinned download directory: %v", err)
		}
		if err := os.MkdirAll(filepath.Dir(outsideDownloadPath), 0755); err != nil {
			t.Fatalf("Failed to create outside download directory: %v", err)
		}

		if err := os.WriteFile(pinnedDownloadPath, []byte("pinned-download"), 0644); err != nil {
			t.Fatalf("Failed to write pinned download file: %v", err)
		}
		if err := os.WriteFile(outsideDownloadPath, []byte("outside-download"), 0644); err != nil {
			t.Fatalf("Failed to write outside download file: %v", err)
		}

		downloadURL := fmt.Sprintf("%s/api/download-file?workspace=%s&path=%s", ts.server.URL, url.QueryEscape("root"), url.QueryEscape(filepath.ToSlash(relativePath)))
		req, _ := http.NewRequest("GET", downloadURL, nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Download request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/download-file, got %d: %s", resp.StatusCode, string(body))
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("Failed to read download response: %v", err)
		}
		if string(body) != "pinned-download" {
			t.Fatalf("Expected pinned download content, got %q", string(body))
		}
	})

	t.Run("delete-folder ignores conflicting workspace parameter", func(t *testing.T) {
		relativeDir := filepath.Join("scoped-delete")
		pinnedDeleteDir := filepath.Join(siteUserDir, relativeDir)
		outsideDeleteDir := filepath.Join(ts.config.ResolvedUploadCwd, relativeDir)

		if err := os.MkdirAll(pinnedDeleteDir, 0755); err != nil {
			t.Fatalf("Failed to create pinned delete directory: %v", err)
		}
		if err := os.MkdirAll(outsideDeleteDir, 0755); err != nil {
			t.Fatalf("Failed to create outside delete directory: %v", err)
		}
		if err := os.WriteFile(filepath.Join(pinnedDeleteDir, "keep-check.txt"), []byte("delete-me"), 0644); err != nil {
			t.Fatalf("Failed to write pinned delete file: %v", err)
		}
		if err := os.WriteFile(filepath.Join(outsideDeleteDir, "outside.txt"), []byte("must-stay"), 0644); err != nil {
			t.Fatalf("Failed to write outside delete file: %v", err)
		}

		form := strings.NewReader("workspace=root&path=" + url.QueryEscape(filepath.ToSlash(relativeDir)))
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/delete-folder", form)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Delete request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/delete-folder, got %d: %s", resp.StatusCode, string(body))
		}

		if _, err := os.Stat(pinnedDeleteDir); !os.IsNotExist(err) {
			t.Fatalf("Expected pinned directory %q to be deleted", pinnedDeleteDir)
		}
		if _, err := os.Stat(outsideDeleteDir); err != nil {
			t.Fatalf("Outside directory should not be deleted, stat error: %v", err)
		}
	})

	t.Run("editor and template endpoints are forbidden for scoped sessions", func(t *testing.T) {
		editBody := strings.NewReader(`{"directory":"docs"}`)
		editReq, _ := http.NewRequest("POST", ts.server.URL+"/api/edit/list-files", editBody)
		editReq.Header.Set("Content-Type", "application/json")
		editResp, err := client.Do(editReq)
		if err != nil {
			t.Fatalf("Editor request failed: %v", err)
		}
		defer editResp.Body.Close()
		if editResp.StatusCode != http.StatusForbidden {
			body, _ := io.ReadAll(editResp.Body)
			t.Fatalf("Expected 403 from /api/edit/list-files, got %d: %s", editResp.StatusCode, string(body))
		}

		templateReq, _ := http.NewRequest("GET", ts.server.URL+"/api/templates", nil)
		templateResp, err := client.Do(templateReq)
		if err != nil {
			t.Fatalf("Templates request failed: %v", err)
		}
		defer templateResp.Body.Close()
		if templateResp.StatusCode != http.StatusForbidden {
			body, _ := io.ReadAll(templateResp.Body)
			t.Fatalf("Expected 403 from /api/templates, got %d: %s", templateResp.StatusCode, string(body))
		}
	})

	t.Run("sites listing is restricted to pinned site", func(t *testing.T) {
		req, _ := http.NewRequest("GET", ts.server.URL+"/api/sites", nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("List sites request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Expected 200 from /api/sites, got %d: %s", resp.StatusCode, string(body))
		}

		var payload struct {
			Sites     []string `json:"sites"`
			SitesPath string   `json:"sitesPath"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("Decode /api/sites response: %v", err)
		}
		if len(payload.Sites) != 1 || payload.Sites[0] != "example.com" {
			t.Fatalf("Expected only [example.com], got %#v", payload.Sites)
		}
		if payload.SitesPath != "" {
			t.Fatalf("Expected sitesPath to be hidden for scoped session, got %q", payload.SitesPath)
		}
	})
}

// ==============================================================================
// TEST 4: File Operations with Security E2E
// ==============================================================================
// This test validates file operations and security:
// 1. Authentication required (401 without session)
// 2. ZIP file upload
// 3. File read-back verification
// 4. Path traversal attack blocked
// 5. Symlink attack blocked (if possible to create)
// 6. File deletion
// ==============================================================================

func TestE2E_FileOperationsWithSecurity(t *testing.T) {
	ts := setupTestServer(t)
	defer ts.cleanup()

	// Step 1: Verify authentication is required
	t.Run("AuthRequired", func(t *testing.T) {
		// Try to upload without auth (need TLS skip for test server)
		noAuthClient := &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
		resp, err := noAuthClient.Post(ts.server.URL+"/api/upload", "multipart/form-data", nil)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized, got %d", resp.StatusCode)
		}
		t.Log("Unauthenticated request correctly rejected with 401")
	})

	// Login for remaining tests
	jar := ts.login(t)
	client := &http.Client{
		Jar: jar,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	// Step 2: Create and upload a ZIP file
	t.Run("ZIPUpload", func(t *testing.T) {
		// Create a ZIP in memory
		var buf bytes.Buffer
		zipWriter := zip.NewWriter(&buf)

		// Add a test file
		testContent := "Hello from E2E test!"
		w, err := zipWriter.Create("test-folder/test-file.txt")
		if err != nil {
			t.Fatalf("Failed to create zip entry: %v", err)
		}
		w.Write([]byte(testContent))
		zipWriter.Close()

		// Create multipart form
		var formBuf bytes.Buffer
		formWriter := multipart.NewWriter(&formBuf)
		formWriter.WriteField("workspace", "root")
		formWriter.WriteField("targetDir", "./")

		part, err := formWriter.CreateFormFile("file", "test.zip")
		if err != nil {
			t.Fatalf("Failed to create form file: %v", err)
		}
		part.Write(buf.Bytes())
		formWriter.Close()

		// Upload
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/upload", &formBuf)
		req.Header.Set("Content-Type", formWriter.FormDataContentType())
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Upload request failed: %v", err)
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Upload failed with status %d: %s", resp.StatusCode, string(body))
		}

		var result map[string]interface{}
		json.Unmarshal(body, &result)
		if result["success"] != true {
			t.Fatalf("Upload did not return success: %s", string(body))
		}
		t.Logf("ZIP uploaded successfully: %v files", result["fileCount"])
	})

	// Step 2b: Test non-ZIP file upload with custom name
	t.Run("NonZIPUploadWithCustomName", func(t *testing.T) {
		// Create multipart form with a regular text file
		var formBuf bytes.Buffer
		formWriter := multipart.NewWriter(&formBuf)
		formWriter.WriteField("workspace", "root")
		formWriter.WriteField("targetDir", "./")
		formWriter.WriteField("name", "custom-named-file.txt")

		part, err := formWriter.CreateFormFile("file", "original-name.txt")
		if err != nil {
			t.Fatalf("Failed to create form file: %v", err)
		}
		part.Write([]byte("Hello from non-ZIP upload!"))
		formWriter.Close()

		// Upload
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/upload", &formBuf)
		req.Header.Set("Content-Type", formWriter.FormDataContentType())
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Upload request failed: %v", err)
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Non-ZIP upload failed with status %d: %s", resp.StatusCode, string(body))
		}

		var result map[string]interface{}
		json.Unmarshal(body, &result)
		if result["success"] != true {
			t.Fatalf("Non-ZIP upload did not return success: %s", string(body))
		}
		if result["filename"] != "custom-named-file.txt" {
			t.Fatalf("Expected filename 'custom-named-file.txt', got: %v", result["filename"])
		}
		t.Logf("Non-ZIP file uploaded with custom name: %v", result["filename"])
	})

	// Step 2c: Test non-ZIP upload without custom name (should use original)
	t.Run("NonZIPUploadOriginalName", func(t *testing.T) {
		// Create multipart form with a regular text file
		var formBuf bytes.Buffer
		formWriter := multipart.NewWriter(&formBuf)
		formWriter.WriteField("workspace", "root")
		formWriter.WriteField("targetDir", "./")

		part, err := formWriter.CreateFormFile("file", "keep-this-name.json")
		if err != nil {
			t.Fatalf("Failed to create form file: %v", err)
		}
		part.Write([]byte(`{"hello": "world"}`))
		formWriter.Close()

		// Upload
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/upload", &formBuf)
		req.Header.Set("Content-Type", formWriter.FormDataContentType())
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Upload request failed: %v", err)
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Non-ZIP upload failed with status %d: %s", resp.StatusCode, string(body))
		}

		var result map[string]interface{}
		json.Unmarshal(body, &result)
		if result["success"] != true {
			t.Fatalf("Non-ZIP upload did not return success: %s", string(body))
		}
		if result["filename"] != "keep-this-name.json" {
			t.Fatalf("Expected filename 'keep-this-name.json', got: %v", result["filename"])
		}
		t.Logf("Non-ZIP file uploaded with original name: %v", result["filename"])
	})

	// Step 3: Read back the uploaded file
	t.Run("FileReadback", func(t *testing.T) {
		form := strings.NewReader("workspace=root&path=test-folder/test-file.txt")
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/read-file", form)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Read request failed: %v", err)
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Read failed with status %d: %s", resp.StatusCode, string(body))
		}

		var result map[string]interface{}
		json.Unmarshal(body, &result)
		content, ok := result["content"].(string)
		if !ok || content != "Hello from E2E test!" {
			t.Fatalf("File content mismatch. Expected 'Hello from E2E test!', got: %v", result["content"])
		}
		t.Log("File read back successfully with correct content")
	})

	// Step 4: Path traversal attack should be blocked
	t.Run("PathTraversalBlocked", func(t *testing.T) {
		// Try to read /etc/passwd via path traversal
		form := strings.NewReader("workspace=root&path=../../../etc/passwd")
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/read-file", form)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		// Should be blocked (400 Bad Request)
		if resp.StatusCode != http.StatusBadRequest {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Path traversal was NOT blocked! Status: %d, Body: %s", resp.StatusCode, string(body))
		}
		t.Log("Path traversal attack correctly blocked")
	})

	// Step 5: Test symlink attack (create symlink, try to read through it)
	t.Run("SymlinkAttackBlocked", func(t *testing.T) {
		// Create a symlink pointing outside workspace
		symlinkPath := filepath.Join(ts.config.ResolvedUploadCwd, "evil-symlink")
		err := os.Symlink("/etc/passwd", symlinkPath)
		if err != nil {
			t.Skip("Cannot create symlink (might need privileges)")
		}

		// Try to read through the symlink
		form := strings.NewReader("workspace=root&path=evil-symlink")
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/read-file", form)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		// Should be blocked
		if resp.StatusCode == http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			var result map[string]interface{}
			json.Unmarshal(body, &result)
			if content, ok := result["content"].(string); ok && strings.Contains(content, "root:") {
				t.Fatalf("Symlink attack succeeded! Read /etc/passwd content")
			}
		}
		t.Log("Symlink attack correctly blocked or symlink not readable")
	})

	// Step 6: Delete the uploaded folder
	t.Run("FileDelete", func(t *testing.T) {
		form := strings.NewReader("workspace=root&path=test-folder")
		req, _ := http.NewRequest("POST", ts.server.URL+"/api/delete-folder", form)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Delete request failed: %v", err)
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Delete failed with status %d: %s", resp.StatusCode, string(body))
		}

		var result map[string]interface{}
		json.Unmarshal(body, &result)
		if result["success"] != true {
			t.Fatalf("Delete did not return success: %s", string(body))
		}
		t.Log("File deleted successfully")

		// Verify it's gone
		deletedPath := filepath.Join(ts.config.ResolvedUploadCwd, "test-folder")
		if _, err := os.Stat(deletedPath); !os.IsNotExist(err) {
			t.Fatalf("Folder still exists after delete!")
		}
		t.Log("Verified folder is deleted from filesystem")
	})

	t.Log("File operations with security E2E test PASSED")
}

// ==============================================================================
// Helper functions
// ==============================================================================

func buildCookieHeader(jar http.CookieJar, rawURL string) string {
	cookies := jar.Cookies(mustParseURL(rawURL))
	header := ""
	for _, c := range cookies {
		if header != "" {
			header += "; "
		}
		header += c.Name + "=" + c.Value
	}
	return header
}

func createTLSClient(jar http.CookieJar) *http.Client {
	return &http.Client{
		Jar: jar,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

func createWSLease(client *http.Client, serverURL, workspace string) (string, *http.Response, error) {
	body := strings.NewReader("workspace=" + url.QueryEscape(workspace))
	req, _ := http.NewRequest("POST", serverURL+"/api/ws-lease", body)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return "", resp, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(resp.Body)
		return "", resp, fmt.Errorf("lease request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	var payload struct {
		Lease string `json:"lease"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", resp, fmt.Errorf("decode lease response: %w", err)
	}
	if payload.Lease == "" {
		return "", resp, fmt.Errorf("lease response missing token")
	}

	return payload.Lease, resp, nil
}

func dialWS(serverURL, lease, cookieHeader string) (*websocket.Conn, *http.Response, error) {
	wsURL := "wss" + strings.TrimPrefix(serverURL, "https") + "/ws?lease=" + url.QueryEscape(lease)
	dialer := websocket.Dialer{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	header := http.Header{}
	if cookieHeader != "" {
		header.Set("Cookie", cookieHeader)
	}
	return dialer.Dial(wsURL, header)
}

func mustParseURL(rawURL string) *url.URL {
	u, err := url.Parse(rawURL)
	if err != nil {
		panic(err)
	}
	return u
}
