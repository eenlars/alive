package files

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shell-server-go/internal/config"
	httpxmiddleware "shell-server-go/internal/httpx/middleware"
	"shell-server-go/internal/session"
)

func TestHandler_ReadFileBlocksTraversal(t *testing.T) {
	h, sessions := setupFilesHandler(t)
	defer sessions.Stop()

	form := url.Values{}
	form.Set("workspace", "root")
	form.Set("path", "../secret.txt")

	req := httptest.NewRequest(http.MethodPost, "/api/read-file", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()

	h.ReadFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_UploadUsesPinnedWorkspace(t *testing.T) {
	h, sessions := setupFilesHandler(t)
	defer sessions.Stop()

	token := sessions.GenerateWithInfo(session.SessionInfo{Workspace: "site:example.com"})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("workspace", "root")
	_ = writer.WriteField("targetDir", "scoped-upload")
	part, err := writer.CreateFormFile("file", "scoped.txt")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := io.WriteString(part, "scoped upload content"); err != nil {
		t.Fatalf("write multipart content: %v", err)
	}
	_ = writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: httpxmiddleware.CookieName, Value: token})
	w := httptest.NewRecorder()

	h.Upload(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	pinnedPath := filepath.Join(h.config.ResolvedSitesPath, "example.com", "user", "scoped-upload", "scoped.txt")
	content, err := os.ReadFile(pinnedPath)
	if err != nil {
		t.Fatalf("expected uploaded file at pinned path: %v", err)
	}
	if string(content) != "scoped upload content" {
		t.Fatalf("unexpected pinned file content: %q", string(content))
	}

	outsidePath := filepath.Join(h.config.ResolvedUploadCwd, "scoped-upload", "scoped.txt")
	if _, err := os.Stat(outsidePath); !os.IsNotExist(err) {
		t.Fatalf("unexpected file in root workspace: %s", outsidePath)
	}
}

func setupFilesHandler(t *testing.T) (*Handler, *session.Store) {
	t.Helper()

	tmp := t.TempDir()
	workspaceDir := filepath.Join(tmp, "workspace")
	uploadsDir := filepath.Join(tmp, "uploads")
	sitesDir := filepath.Join(tmp, "sites")
	for _, dir := range []string{workspaceDir, uploadsDir, sitesDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	cfg := &config.AppConfig{
		Env:                     "test",
		Port:                    0,
		DefaultWorkspace:        "root",
		ResolvedDefaultCwd:      workspaceDir,
		ResolvedUploadCwd:       uploadsDir,
		ResolvedSitesPath:       sitesDir,
		WorkspaceBase:           tmp,
		AllowWorkspaceSelection: true,
		EditableDirectories:     []config.EditableDirectory{},
		ShellPassword:           "testpassword123",
	}

	sessions := session.NewStore(filepath.Join(tmp, ".sessions.json"))
	return NewHandler(cfg, sessions), sessions
}

func TestHandler_ListSitesScopedSessionHidesPath(t *testing.T) {
	h, sessions := setupFilesHandler(t)
	defer sessions.Stop()

	if err := os.MkdirAll(filepath.Join(h.config.ResolvedSitesPath, "example.com", "user"), 0755); err != nil {
		t.Fatalf("create site workspace: %v", err)
	}

	token := sessions.GenerateWithInfo(session.SessionInfo{Workspace: "site:example.com"})
	req := httptest.NewRequest(http.MethodGet, "/api/sites", nil)
	req.AddCookie(&http.Cookie{Name: httpxmiddleware.CookieName, Value: token})
	w := httptest.NewRecorder()

	h.ListSites(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var payload struct {
		Sites     []string `json:"sites"`
		SitesPath string   `json:"sitesPath"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Sites) != 1 || payload.Sites[0] != "example.com" {
		t.Fatalf("expected single scoped site, got %v", payload.Sites)
	}
	if payload.SitesPath != "" {
		t.Fatalf("expected sitesPath hidden for scoped session, got %q", payload.SitesPath)
	}
}
