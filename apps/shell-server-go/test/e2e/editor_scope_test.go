package e2e

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"shell-server-go/test/testutil"
)

func TestE2E_EditorScopePolicy(t *testing.T) {
	ts := testutil.Setup(t)
	defer ts.Cleanup()

	t.Run("scoped session is forbidden", func(t *testing.T) {
		site := "editor-scope.alive.best"
		ts.EnsureSiteWorkspace(t, site)

		jar := ts.LoginWithWorkspace(t, site)
		client := ts.NewHTTPClient(jar)

		resp, err := client.Post(ts.Server.URL+"/api/edit/list-files", "application/json", strings.NewReader(`{"directory":"docs"}`))
		if err != nil {
			t.Fatalf("editor request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusForbidden {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 403, got %d body=%s", resp.StatusCode, string(body))
		}
	})

	t.Run("unscoped session keeps editor endpoint active", func(t *testing.T) {
		jar := ts.Login(t)
		client := ts.NewHTTPClient(jar)

		resp, err := client.Post(ts.Server.URL+"/api/edit/list-files", "application/json", strings.NewReader(`{"directory":"unknown"}`))
		if err != nil {
			t.Fatalf("editor request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 400 for invalid directory, got %d body=%s", resp.StatusCode, string(body))
		}
	})
}
