package testutil

import (
	"crypto/tls"
	"io"
	"io/fs"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"shell-server-go/internal/auth"
	"shell-server-go/internal/config"
	"shell-server-go/internal/editor"
	"shell-server-go/internal/files"
	httpxmiddleware "shell-server-go/internal/httpx/middleware"
	"shell-server-go/internal/logger"
	"shell-server-go/internal/ratelimit"
	"shell-server-go/internal/session"
	"shell-server-go/internal/templates"
	"shell-server-go/internal/terminal"
)

// TestServer holds the in-memory test server and dependencies.
type TestServer struct {
	Server    *httptest.Server
	Sessions  *session.Store
	Limiter   *ratelimit.Limiter
	WSHandler *terminal.WSHandler
	Config    *config.AppConfig
	TempDir   string
}

// Setup creates a fully wired test server.
func Setup(t testing.TB) *TestServer {
	t.Helper()

	logger.Init(logger.Config{Output: io.Discard, MinLevel: logger.ERROR, UseColor: false})

	tempDir, err := os.MkdirTemp("", "shell-server-test-*")
	if err != nil {
		t.Fatalf("create temp dir: %v", err)
	}

	workspaceDir := filepath.Join(tempDir, "workspace")
	sitesDir := filepath.Join(tempDir, "sites")
	uploadsDir := filepath.Join(tempDir, "uploads")

	for _, dir := range []string{workspaceDir, sitesDir, uploadsDir} {
		if mkErr := os.MkdirAll(dir, 0755); mkErr != nil {
			t.Fatalf("create dir %s: %v", dir, mkErr)
		}
	}

	cfg := &config.AppConfig{
		Env:                     "test",
		Port:                    0,
		DefaultWorkspace:        "root",
		ResolvedDefaultCwd:      workspaceDir,
		ResolvedUploadCwd:       uploadsDir,
		ResolvedSitesPath:       sitesDir,
		WorkspaceBase:           tempDir,
		AllowWorkspaceSelection: true,
		EditableDirectories:     []config.EditableDirectory{},
		ShellPassword:           "testpassword123",
	}

	sessions := session.NewStore(filepath.Join(tempDir, ".sessions.json"))
	limiter := ratelimit.NewLimiter(filepath.Join(tempDir, ".rate-limit-state.json"))

	authHandler := auth.NewHandler(cfg, sessions, limiter)
	fileHandler := files.NewHandler(cfg, sessions)
	editorHandler := editor.NewHandler(cfg, sessions)
	wsHandler := terminal.NewWSHandler(cfg, sessions)
	templateHandler := templates.NewHandler(cfg, sessions)

	clientFS := fstest.MapFS{
		"index.html": {Data: []byte(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`)},
	}

	mux := http.NewServeMux()
	authAPI := httpxmiddleware.AuthAPI(sessions)

	mux.HandleFunc("POST /login", authHandler.Login)
	mux.HandleFunc("/logout", authHandler.Logout)

	mux.Handle("GET /api/config", authAPI(http.HandlerFunc(fileHandler.Config)))
	mux.HandleFunc("/health", fileHandler.Health)

	mux.HandleFunc("/ws", wsHandler.Handle)
	mux.Handle("POST /api/ws-lease", authAPI(http.HandlerFunc(wsHandler.CreateLease)))

	mux.Handle("POST /api/list-files", authAPI(http.HandlerFunc(fileHandler.ListFiles)))
	mux.Handle("POST /api/check-directory", authAPI(http.HandlerFunc(fileHandler.CheckDirectory)))
	mux.Handle("POST /api/create-directory", authAPI(http.HandlerFunc(fileHandler.CreateDirectory)))
	mux.Handle("POST /api/upload", authAPI(http.HandlerFunc(fileHandler.Upload)))
	mux.Handle("POST /api/read-file", authAPI(http.HandlerFunc(fileHandler.ReadFile)))
	mux.Handle("GET /api/download-file", authAPI(http.HandlerFunc(fileHandler.DownloadFile)))
	mux.Handle("POST /api/delete-folder", authAPI(http.HandlerFunc(fileHandler.DeleteFolder)))
	mux.Handle("GET /api/sites", authAPI(http.HandlerFunc(fileHandler.ListSites)))

	mux.Handle("POST /api/edit/list-files", authAPI(http.HandlerFunc(editorHandler.ListFiles)))
	mux.Handle("POST /api/edit/read-file", authAPI(http.HandlerFunc(editorHandler.ReadFile)))
	mux.Handle("POST /api/edit/write-file", authAPI(http.HandlerFunc(editorHandler.WriteFile)))
	mux.Handle("POST /api/edit/check-mtimes", authAPI(http.HandlerFunc(editorHandler.CheckMtimes)))
	mux.Handle("POST /api/edit/delete", authAPI(http.HandlerFunc(editorHandler.Delete)))
	mux.Handle("POST /api/edit/copy", authAPI(http.HandlerFunc(editorHandler.Copy)))

	mux.Handle("GET /api/templates", authAPI(http.HandlerFunc(templateHandler.ListTemplates)))
	mux.Handle("POST /api/templates", authAPI(http.HandlerFunc(templateHandler.CreateTemplate)))
	mux.Handle("GET /api/templates/{id}", authAPI(http.HandlerFunc(templateHandler.GetTemplate)))
	mux.Handle("PUT /api/templates/{id}", authAPI(http.HandlerFunc(templateHandler.SaveTemplate)))

	mux.Handle("/", createTestSPAHandler(clientFS))

	server := httptest.NewTLSServer(mux)

	return &TestServer{
		Server:    server,
		Sessions:  sessions,
		Limiter:   limiter,
		WSHandler: wsHandler,
		Config:    cfg,
		TempDir:   tempDir,
	}
}

func createTestSPAHandler(clientFS fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		indexFile, err := fs.ReadFile(clientFS, "index.html")
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(indexFile)
	})
}

// Cleanup stops server resources and removes temp artifacts.
func (ts *TestServer) Cleanup() {
	if ts.Server != nil {
		ts.Server.Close()
	}
	if ts.Limiter != nil {
		ts.Limiter.Stop()
	}
	if ts.Sessions != nil {
		ts.Sessions.Stop()
	}
	if ts.TempDir != "" {
		_ = os.RemoveAll(ts.TempDir)
	}
}

func (ts *TestServer) Login(t testing.TB) *cookiejar.Jar {
	t.Helper()
	return ts.LoginWithWorkspace(t, "")
}

func (ts *TestServer) LoginWithWorkspace(t testing.TB, workspace string) *cookiejar.Jar {
	t.Helper()

	jar, _ := cookiejar.New(nil)
	client := ts.NewHTTPClient(jar)
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}

	values := url.Values{}
	values.Set("password", ts.Config.ShellPassword)
	if strings.TrimSpace(workspace) != "" {
		values.Set("workspace", workspace)
	}

	resp, err := client.Post(ts.Server.URL+"/login", "application/x-www-form-urlencoded", strings.NewReader(values.Encode()))
	if err != nil {
		t.Fatalf("login request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusSeeOther {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("login failed status=%d body=%s", resp.StatusCode, string(body))
	}

	serverURL, _ := url.Parse(ts.Server.URL)
	jar.SetCookies(serverURL, resp.Cookies())

	cookies := jar.Cookies(serverURL)
	for _, c := range cookies {
		if c.Name == "shell_session" {
			return jar
		}
	}
	t.Fatalf("no shell_session cookie received")
	return nil
}

func (ts *TestServer) NewHTTPClient(jar *cookiejar.Jar) *http.Client {
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	if jar != nil {
		client.Jar = jar
	}
	return client
}

func (ts *TestServer) WebSocketURL(path string) string {
	return strings.Replace(ts.Server.URL, "https://", "wss://", 1) + path
}

// EnsureSiteWorkspace creates a site workspace and returns its absolute user dir.
func (ts *TestServer) EnsureSiteWorkspace(t testing.TB, site string) string {
	t.Helper()
	userDir := filepath.Join(ts.Config.ResolvedSitesPath, site, "user")
	if err := os.MkdirAll(userDir, 0755); err != nil {
		t.Fatalf("create site workspace: %v", err)
	}
	return userDir
}

// SupportsPTY reports whether the current environment can open a PTY device.
func SupportsPTY() bool {
	f, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		return false
	}
	_ = f.Close()
	return true
}
