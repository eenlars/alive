package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
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
	previewPrefix     = "preview--"
	portMapRefresh    = 30 * time.Second
	sessionCookieName = "__alive_preview"
	sessionMaxAge     = 300 // 5 minutes (matches JWT expiry)
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
	pm.mu.RLock()
	count := len(pm.ports)
	pm.mu.RUnlock()
	if count == 0 {
		log.Printf("[port-map] WARNING: port map is empty at startup — all requests will 404 until next refresh")
	}
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

// navScript is defined in nav_script_gen.go (generated from @webalive/shared PREVIEW_MESSAGES).
// Run `bun run generate` to regenerate after changing PREVIEW_MESSAGES constants.

func main() {
	cfg := loadConfig()
	ports := newPortMap(cfg.PortMapPath)

	handler := &previewHandler{
		cfg:   cfg,
		ports: ports,
		transport: &http.Transport{
			ForceAttemptHTTP2:  false, // HTTP/1.1 for WebSocket compatibility
			DisableCompression: true,  // Don't add Accept-Encoding; we handle encoding ourselves
		},
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
	cfg       config
	ports     *portMap
	transport http.RoundTripper // shared transport for connection pooling
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

	// Authenticate: accept preview_token JWT (query param) or session cookie.
	// The initial iframe load sends ?preview_token=..., but sub-resource requests
	// (CSS, JS, fonts, API calls) won't have the token — they use the cookie instead.
	token := r.URL.Query().Get("preview_token")
	hasValidToken := token != "" && h.verifyToken(token)
	hasValidCookie := !hasValidToken && h.verifySessionCookie(r, hostname)

	if !hasValidToken && !hasValidCookie {
		http.Error(w, "Missing or invalid preview_token", http.StatusUnauthorized)
		return
	}

	// On first request with a valid token, set a session cookie for sub-resources
	if hasValidToken {
		h.setSessionCookie(w, hostname)
	}

	// Look up port
	port, ok := h.ports.lookup(hostname)
	if !ok {
		http.Error(w, "Site not found", http.StatusNotFound)
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
			// Strip Accept-Encoding so upstream sends uncompressed responses.
			// We inject a nav script into HTML — compressed bodies would be corrupted.
			pr.Out.Header.Del("Accept-Encoding")
		},
		Transport: h.transport,
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

// Session cookie: HMAC-SHA256(hostname + "|" + expiryUnix, jwtSecret)
// Binds the cookie to a specific preview hostname and time window.
func (h *previewHandler) makeSessionValue(hostname string, expiry int64) string {
	mac := hmac.New(sha256.New, h.cfg.JWTSecret)
	mac.Write([]byte(fmt.Sprintf("%s|%d", hostname, expiry)))
	return fmt.Sprintf("%d.%s", expiry, hex.EncodeToString(mac.Sum(nil)))
}

func (h *previewHandler) setSessionCookie(w http.ResponseWriter, hostname string) {
	expiry := time.Now().Add(time.Duration(sessionMaxAge) * time.Second).Unix()
	value := h.makeSessionValue(hostname, expiry)
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   sessionMaxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
	})
}

func (h *previewHandler) verifySessionCookie(r *http.Request, hostname string) bool {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return false
	}

	// Parse "expiry.hmac" format
	parts := strings.SplitN(cookie.Value, ".", 2)
	if len(parts) != 2 {
		return false
	}

	var expiry int64
	if _, err := fmt.Sscanf(parts[0], "%d", &expiry); err != nil {
		return false
	}

	// Check expiry
	if time.Now().Unix() > expiry {
		return false
	}

	// Verify HMAC
	expected := h.makeSessionValue(hostname, expiry)
	return hmac.Equal([]byte(cookie.Value), []byte(expected))
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
