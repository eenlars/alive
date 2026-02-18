package editor

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"shell-server-go/internal/config"
	httpxmiddleware "shell-server-go/internal/httpx/middleware"
	"shell-server-go/internal/session"
)

func TestHandler_ListFilesScopedSessionForbidden(t *testing.T) {
	h, sessions, _ := setupEditorHandler(t)
	defer sessions.Stop()

	token := sessions.GenerateWithInfo(session.SessionInfo{Workspace: "site:example.com"})
	req := httptest.NewRequest(http.MethodPost, "/api/edit/list-files", bytes.NewReader([]byte(`{"directory":"docs"}`)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: httpxmiddleware.CookieName, Value: token})
	w := httptest.NewRecorder()

	h.ListFiles(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_WriteFileUnscopedSuccess(t *testing.T) {
	h, sessions, docsDir := setupEditorHandler(t)
	defer sessions.Stop()

	token := sessions.GenerateWithInfo(session.SessionInfo{})
	reqBody := map[string]string{
		"directory": "docs",
		"path":      "nested/file.txt",
		"content":   "hello editor",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/edit/write-file", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: httpxmiddleware.CookieName, Value: token})
	w := httptest.NewRecorder()

	h.WriteFile(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	writtenPath := filepath.Join(docsDir, "nested", "file.txt")
	content, err := os.ReadFile(writtenPath)
	if err != nil {
		t.Fatalf("expected written file: %v", err)
	}
	if string(content) != "hello editor" {
		t.Fatalf("unexpected content: %q", string(content))
	}
}

func TestHandler_ReadFileTraversalBlocked(t *testing.T) {
	h, sessions, _ := setupEditorHandler(t)
	defer sessions.Stop()

	token := sessions.GenerateWithInfo(session.SessionInfo{})
	req := httptest.NewRequest(http.MethodPost, "/api/edit/read-file", bytes.NewReader([]byte(`{"directory":"docs","path":"../secret.txt"}`)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: httpxmiddleware.CookieName, Value: token})
	w := httptest.NewRecorder()

	h.ReadFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}
}

func setupEditorHandler(t *testing.T) (*Handler, *session.Store, string) {
	t.Helper()

	tmp := t.TempDir()
	docsDir := filepath.Join(tmp, "docs")
	if err := os.MkdirAll(docsDir, 0755); err != nil {
		t.Fatalf("mkdir docs: %v", err)
	}

	cfg := &config.AppConfig{
		Env:                "test",
		Port:               0,
		DefaultWorkspace:   "root",
		ResolvedDefaultCwd: filepath.Join(tmp, "workspace"),
		ResolvedUploadCwd:  filepath.Join(tmp, "uploads"),
		ResolvedSitesPath:  filepath.Join(tmp, "sites"),
		WorkspaceBase:      tmp,
		EditableDirectories: []config.EditableDirectory{
			{ID: "docs", Label: "Docs", Path: docsDir},
		},
		ShellPassword: "testpassword123",
	}

	for _, dir := range []string{cfg.ResolvedDefaultCwd, cfg.ResolvedUploadCwd, cfg.ResolvedSitesPath} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	sessions := session.NewStore(filepath.Join(tmp, ".sessions.json"))
	return NewHandler(cfg, sessions), sessions, docsDir
}
