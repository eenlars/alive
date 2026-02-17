package e2e

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"shell-server-go/test/testutil"
)

func TestE2E_FileSecurityBoundaries(t *testing.T) {
	ts := testutil.Setup(t)
	defer ts.Cleanup()

	jar := ts.Login(t)
	client := ts.NewHTTPClient(jar)

	t.Run("read-file blocks traversal", func(t *testing.T) {
		form := url.Values{}
		form.Set("workspace", "root")
		form.Set("path", "../secret.txt")

		resp, err := client.Post(ts.Server.URL+"/api/read-file", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
		if err != nil {
			t.Fatalf("read-file request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 400, got %d body=%s", resp.StatusCode, string(body))
		}
	})

	t.Run("delete-folder blocks workspace root", func(t *testing.T) {
		form := url.Values{}
		form.Set("workspace", "root")
		form.Set("path", ".")

		resp, err := client.Post(ts.Server.URL+"/api/delete-folder", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
		if err != nil {
			t.Fatalf("delete-folder request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 400, got %d body=%s", resp.StatusCode, string(body))
		}
	})

	t.Run("download-file blocks traversal", func(t *testing.T) {
		q := url.Values{}
		q.Set("workspace", "root")
		q.Set("path", "../../etc/passwd")

		resp, err := client.Get(ts.Server.URL + "/api/download-file?" + q.Encode())
		if err != nil {
			t.Fatalf("download-file request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 400, got %d body=%s", resp.StatusCode, string(body))
		}
	})

	t.Run("upload blocks traversal target", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("workspace", "root")
		_ = writer.WriteField("targetDir", "../../escape")

		filePart, err := writer.CreateFormFile("file", "safe.txt")
		if err != nil {
			t.Fatalf("create multipart file part: %v", err)
		}
		if _, err := filePart.Write([]byte("safe-content")); err != nil {
			t.Fatalf("write multipart file part: %v", err)
		}
		_ = writer.Close()

		resp, err := client.Post(ts.Server.URL+"/api/upload", writer.FormDataContentType(), body)
		if err != nil {
			t.Fatalf("upload request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			payload, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 400, got %d body=%s", resp.StatusCode, string(payload))
		}
	})
}
