package e2e

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"shell-server-go/test/testutil"
)

type wsLeaseResponse struct {
	Lease     string `json:"lease"`
	Workspace string `json:"workspace"`
}

type wsControlMessage struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
}

func TestE2E_WebsocketTerminalSession(t *testing.T) {
	if !testutil.SupportsPTY() {
		t.Skip("PTY device unavailable in current environment")
	}

	ts := testutil.Setup(t)
	defer ts.Cleanup()

	jar := ts.Login(t)
	lease := createLease(t, ts, jar, "root")

	serverURL, _ := url.Parse(ts.Server.URL)
	cookies := jar.Cookies(serverURL)
	cookieParts := make([]string, 0, len(cookies))
	for _, c := range cookies {
		cookieParts = append(cookieParts, c.Name+"="+c.Value)
	}

	header := http.Header{}
	header.Set("Cookie", strings.Join(cookieParts, "; "))

	dialer := websocket.Dialer{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}
	conn, _, err := dialer.Dial(ts.WebSocketURL("/ws?lease="+url.QueryEscape(lease)), header)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(8 * time.Second))
	msgType, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read connected message: %v", err)
	}
	if msgType != websocket.TextMessage {
		t.Fatalf("expected text connected message, got type=%d", msgType)
	}

	var ctrl wsControlMessage
	if err := json.Unmarshal(payload, &ctrl); err != nil {
		t.Fatalf("decode connected message: %v", err)
	}
	if ctrl.Type != "connected" {
		t.Fatalf("expected connected message, got %q", ctrl.Type)
	}

	marker := fmt.Sprintf("E2E_MARKER_%d", time.Now().UnixNano())
	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("echo "+marker+"\n")); err != nil {
		t.Fatalf("write terminal input: %v", err)
	}

	found := false
	for i := 0; i < 20; i++ {
		msgType, data, readErr := conn.ReadMessage()
		if readErr != nil {
			t.Fatalf("read terminal output: %v", readErr)
		}
		if msgType == websocket.BinaryMessage && bytes.Contains(data, []byte(marker)) {
			found = true
			break
		}
		if msgType == websocket.TextMessage {
			var msg wsControlMessage
			if err := json.Unmarshal(data, &msg); err == nil && strings.Contains(msg.Data, marker) {
				found = true
				break
			}
		}
	}

	if !found {
		t.Fatalf("did not observe marker %q in terminal output", marker)
	}
}

func createLease(t *testing.T, ts *testutil.TestServer, jar *cookiejar.Jar, workspace string) string {
	t.Helper()

	client := ts.NewHTTPClient(jar)
	form := url.Values{}
	form.Set("workspace", workspace)

	resp, err := client.Post(ts.Server.URL+"/api/ws-lease", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatalf("request ws lease: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("lease request failed status=%d body=%s", resp.StatusCode, string(body))
	}

	var parsed wsLeaseResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("decode lease response: %v body=%s", err, string(body))
	}
	if parsed.Lease == "" {
		t.Fatalf("lease token is empty: %s", string(body))
	}

	return parsed.Lease
}
