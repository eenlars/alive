package e2e

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"shell-server-go/test/testutil"
)

func TestE2E_LoginRejectsInvalidScopedWorkspace(t *testing.T) {
	ts := testutil.Setup(t)
	defer ts.Cleanup()

	client := ts.NewHTTPClient(nil)
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}

	values := url.Values{}
	values.Set("password", ts.Config.ShellPassword)
	values.Set("workspace", "../evil")

	resp, err := client.Post(ts.Server.URL+"/login", "application/x-www-form-urlencoded", strings.NewReader(values.Encode()))
	if err != nil {
		t.Fatalf("login request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusSeeOther {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected redirect for invalid workspace, got %d body=%s", resp.StatusCode, string(body))
	}

	location := resp.Header.Get("Location")
	if !strings.Contains(location, "error=invalid_workspace") {
		t.Fatalf("expected invalid_workspace redirect, got %q", location)
	}
}
