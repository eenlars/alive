package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	previewPrefix  = "preview--"
	portMapRefresh = 30 * time.Second
)

// portMap caches hostname→port mappings, refreshed periodically from a JSON file
type portMap struct {
	mu       sync.RWMutex
	ports    map[string]int
	filePath string
}

func newPortMap(filePath string) *portMap {
	pm := &portMap{filePath: filePath, ports: make(map[string]int)}
	pm.reload()
	go pm.refreshLoop()
	return pm
}

func (pm *portMap) reload() {
	data, err := os.ReadFile(pm.filePath)
	if err != nil {
		log.Printf("[port-map] failed to read %s: %v", pm.filePath, err)
		return
	}
	var ports map[string]int
	if err := json.Unmarshal(data, &ports); err != nil {
		log.Printf("[port-map] failed to parse %s: %v", pm.filePath, err)
		return
	}
	pm.mu.Lock()
	pm.ports = ports
	pm.mu.Unlock()
	log.Printf("[port-map] loaded %d domains", len(ports))
}

func (pm *portMap) refreshLoop() {
	ticker := time.NewTicker(portMapRefresh)
	defer ticker.Stop()
	for range ticker.C {
		pm.reload()
	}
}

func (pm *portMap) lookup(hostname string) (int, bool) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	port, ok := pm.ports[hostname]
	return port, ok
}

// config holds server configuration loaded from server-config.json
type config struct {
	PreviewBase    string   // e.g. "alive.best"
	FrameAncestors []string // e.g. ["https://app.alive.best", ...]
	JWTSecret      []byte
	PortMapPath    string
	ListenAddr     string
}

func loadConfig() config {
	previewBase := requireEnv("PREVIEW_BASE")
	jwtSecret := requireEnv("JWT_SECRET")
	portMapPath := envOrDefault("PORT_MAP_PATH", "/var/lib/alive/generated/port-map.json")
	listenAddr := envOrDefault("LISTEN_ADDR", ":5055")

	// Frame ancestors from env (comma-separated) or sensible default
	ancestorsStr := envOrDefault("FRAME_ANCESTORS", "")
	var ancestors []string
	if ancestorsStr != "" {
		for _, a := range strings.Split(ancestorsStr, ",") {
			if trimmed := strings.TrimSpace(a); trimmed != "" {
				ancestors = append(ancestors, trimmed)
			}
		}
	}

	return config{
		PreviewBase:    previewBase,
		FrameAncestors: ancestors,
		JWTSecret:      []byte(jwtSecret),
		PortMapPath:    portMapPath,
		ListenAddr:     listenAddr,
	}
}

// Navigation sync script injected into HTML responses.
// Communicates iframe navigation events to the parent (Alive chat UI).
const navScript = `<script>
(function() {
  if (window.parent === window) return;
  function s(t, d) { window.parent.postMessage(Object.assign({type: t}, d), '*'); }
  s('preview:navigation', {path: location.pathname});
  var P = history.pushState, R = history.replaceState;
  history.pushState = function() { s('preview:navigation_start'); P.apply(this, arguments); s('preview:navigation', {path: location.pathname}); };
  history.replaceState = function() { s('preview:navigation_start'); R.apply(this, arguments); s('preview:navigation', {path: location.pathname}); };
  window.addEventListener('popstate', function() { s('preview:navigation_start'); s('preview:navigation', {path: location.pathname}); });
  document.addEventListener('click', function(e) { var a = e.target.closest && e.target.closest('a[href]'); if (a && a.href && !a.target && a.origin === location.origin) s('preview:navigation_start'); }, true);
  window.addEventListener('beforeunload', function() { s('preview:navigation_start'); });
})();
</script>`

func main() {
	cfg := loadConfig()
	ports := newPortMap(cfg.PortMapPath)

	handler := &previewHandler{
		cfg:   cfg,
		ports: ports,
	}

	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		// No ReadTimeout/WriteTimeout — long-lived WebSocket connections need this
		IdleTimeout: 120 * time.Second,
	}

	log.Printf("[preview-proxy] starting on %s (previewBase=%s)", cfg.ListenAddr, cfg.PreviewBase)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("[preview-proxy] server error: %v", err)
	}
}

type previewHandler struct {
	cfg   config
	ports *portMap
}

func (h *previewHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Health check
	if r.URL.Path == "/health" {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","time":"%s"}`, time.Now().UTC().Format(time.RFC3339))
		return
	}

	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}

	// Parse preview hostname: preview--{label}.{previewBase}
	hostname, err := h.extractHostname(host)
	if err != nil {
		http.Error(w, "Invalid preview host", http.StatusBadRequest)
		return
	}

	// Verify preview_token JWT
	token := r.URL.Query().Get("preview_token")
	if token == "" {
		http.Error(w, "Missing preview_token", http.StatusUnauthorized)
		return
	}
	if !h.verifyToken(token) {
		http.Error(w, "Invalid or expired preview_token", http.StatusUnauthorized)
		return
	}

	// Look up port
	port, ok := h.ports.lookup(hostname)
	if !ok {
		http.Error(w, fmt.Sprintf("Site not found: %s", hostname), http.StatusNotFound)
		return
	}

	// Strip preview_token from the query before proxying
	q := r.URL.Query()
	q.Del("preview_token")
	r.URL.RawQuery = q.Encode()

	target := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("localhost:%d", port),
	}

	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.Out.Host = "localhost"
			pr.Out.Header.Set("X-Forwarded-Host", hostname)
			pr.Out.Header.Set("X-Forwarded-Proto", "https")
		},
		Transport: &http.Transport{
			ForceAttemptHTTP2:  false, // HTTP/1.1 for WebSocket compatibility
			DisableCompression: true,  // Pass-through, don't manipulate
		},
		ModifyResponse: func(resp *http.Response) error {
			// Remove X-Frame-Options so iframe embedding works
			resp.Header.Del("X-Frame-Options")

			// Set frame-ancestors CSP
			if len(h.cfg.FrameAncestors) > 0 {
				resp.Header.Set("Content-Security-Policy",
					fmt.Sprintf("frame-ancestors %s", strings.Join(h.cfg.FrameAncestors, " ")))
			}

			// Inject navigation script into HTML responses
			ct := resp.Header.Get("Content-Type")
			if strings.Contains(ct, "text/html") {
				return h.injectNavScript(resp)
			}
			return nil
		},
	}

	proxy.ServeHTTP(w, r)
}

// extractHostname converts "preview--notion-alive-best.alive.best" → "notion.alive.best"
func (h *previewHandler) extractHostname(host string) (string, error) {
	if !strings.HasPrefix(host, previewPrefix) {
		return "", fmt.Errorf("missing preview prefix")
	}

	rest := host[len(previewPrefix):]
	suffix := "." + h.cfg.PreviewBase
	if !strings.HasSuffix(rest, suffix) {
		return "", fmt.Errorf("invalid preview domain suffix")
	}

	label := rest[:len(rest)-len(suffix)]
	if label == "" {
		return "", fmt.Errorf("empty preview label")
	}

	// Convert label back to domain: "notion-alive-best" → "notion.alive.best"
	return strings.ReplaceAll(label, "-", "."), nil
}

// verifyToken validates a preview_token JWT (HS256, type=preview, not expired)
func (h *previewHandler) verifyToken(tokenStr string) bool {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return h.cfg.JWTSecret, nil
	})
	if err != nil {
		return false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return false
	}

	// Must be a preview token
	tokenType, _ := claims["type"].(string)
	return tokenType == "preview"
}

// injectNavScript reads the HTML body, injects the nav script after <head>, and updates the response
func (h *previewHandler) injectNavScript(resp *http.Response) error {
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return err
	}

	// Inject after <head> (case-insensitive)
	lower := bytes.ToLower(body)
	idx := bytes.Index(lower, []byte("<head>"))
	if idx >= 0 {
		injection := []byte(navScript)
		insertAt := idx + len("<head>")
		modified := make([]byte, 0, len(body)+len(injection))
		modified = append(modified, body[:insertAt]...)
		modified = append(modified, injection...)
		modified = append(modified, body[insertAt:]...)
		body = modified
	}

	resp.Body = io.NopCloser(bytes.NewReader(body))
	resp.ContentLength = int64(len(body))
	resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(body)))
	resp.Header.Del("Content-Encoding") // We decoded it
	return nil
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("[preview-proxy] required env var %s is not set", key)
	}
	return v
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
