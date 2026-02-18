package e2e

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shell-server-go/test/testutil"
)

func TestE2E_SessionScopedWorkspaceEnforcement(t *testing.T) {
	ts := testutil.Setup(t)
	defer ts.Cleanup()

	site := "acme.alive.best"
	userDir := ts.EnsureSiteWorkspace(t, site)
	if err := os.WriteFile(filepath.Join(userDir, "hello.txt"), []byte("hello"), 0644); err != nil {
		t.Fatalf("seed workspace file: %v", err)
	}

	jar := ts.LoginWithWorkspace(t, site)
	client := ts.NewHTTPClient(jar)

	form := url.Values{}
	form.Set("workspace", "root") // must be ignored due pinned session scope
	resp, err := client.Post(ts.Server.URL+"/api/list-files", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatalf("list-files request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("list-files status=%d body=%s", resp.StatusCode, string(body))
	}

	var listPayload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode list-files: %v", err)
	}

	pathValue, _ := listPayload["path"].(string)
	if pathValue != userDir {
		t.Fatalf("expected pinned workspace path %q, got %q", userDir, pathValue)
	}

	configResp, err := client.Get(ts.Server.URL + "/api/config")
	if err != nil {
		t.Fatalf("config request failed: %v", err)
	}
	defer configResp.Body.Close()

	if configResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(configResp.Body)
		t.Fatalf("config status=%d body=%s", configResp.StatusCode, string(body))
	}

	var configPayload map[string]any
	if err := json.NewDecoder(configResp.Body).Decode(&configPayload); err != nil {
		t.Fatalf("decode config: %v", err)
	}
	if configPayload["defaultWorkspace"] != "site:"+site {
		t.Fatalf("expected defaultWorkspace %q, got %#v", "site:"+site, configPayload["defaultWorkspace"])
	}
	if allow, _ := configPayload["allowWorkspaceSelection"].(bool); allow {
		t.Fatalf("expected allowWorkspaceSelection=false for pinned sessions")
	}

	sitesResp, err := client.Get(ts.Server.URL + "/api/sites")
	if err != nil {
		t.Fatalf("sites request failed: %v", err)
	}
	defer sitesResp.Body.Close()

	if sitesResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(sitesResp.Body)
		t.Fatalf("sites status=%d body=%s", sitesResp.StatusCode, string(body))
	}

	var sitesPayload struct {
		Sites []string `json:"sites"`
	}
	if err := json.NewDecoder(sitesResp.Body).Decode(&sitesPayload); err != nil {
		t.Fatalf("decode sites response: %v", err)
	}
	if len(sitesPayload.Sites) != 1 || sitesPayload.Sites[0] != site {
		t.Fatalf("expected only pinned site %q, got %v", site, sitesPayload.Sites)
	}

	lease := createLease(t, ts, jar, "root")
	if lease == "" {
		t.Fatalf("expected ws lease token")
	}
}
