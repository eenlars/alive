package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/golang-jwt/jwt/v5"
)

const (
	previewPrefix     = "preview--"
	portMapRefresh    = 30 * time.Second
	sessionCookieName = "__alive_preview"
	sessionMaxAge     = 300 // 5 minutes (matches JWT expiry)
	// Sentry DSN is read from SENTRY_DSN env var; no hardcoded fallback.
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
		captureError(err, "port map read failed: %s", pm.filePath)
		log.Printf("[port-map] failed to read %s: %v", pm.filePath, err)
		return
	}
	var ports map[string]int
	if err := json.Unmarshal(data, &ports); err != nil {
		captureError(err, "port map parse failed: %s", pm.filePath)
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
	ImagesStorage  string // e.g. "/srv/webalive/storage" — serves /_images/* directly
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

	imagesStorage := envOrDefault("IMAGES_STORAGE", "")

	return config{
		PreviewBase:    previewBase,
		FrameAncestors: ancestors,
		JWTSecret:      []byte(jwtSecret),
		PortMapPath:    portMapPath,
		ListenAddr:     listenAddr,
		ImagesStorage:  imagesStorage,
	}
}

// navScript is defined in nav_script_gen.go (generated from @webalive/shared PREVIEW_MESSAGES).
// Run `bun run generate` to regenerate after changing PREVIEW_MESSAGES constants.

func main() {
	initSentry("preview-proxy")
	defer sentry.Flush(2 * time.Second)

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

	// SIGHUP triggers immediate port-map reload (used by deploy pipeline)
	sighup := make(chan os.Signal, 1)
	signal.Notify(sighup, syscall.SIGHUP)
	go func() {
		for range sighup {
			log.Printf("[port-map] SIGHUP received — reloading")
			ports.reload()
		}
	}()

	log.Printf("[preview-proxy] starting on %s (previewBase=%s)", cfg.ListenAddr, cfg.PreviewBase)
	if err := server.ListenAndServe(); err != nil {
		if errors.Is(err, http.ErrServerClosed) {
			return
		}
		captureError(err, "preview-proxy ListenAndServe failed")
		sentry.Flush(2 * time.Second)
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
		h.serveNotFound(w, host)
		return
	}

	// Authenticate: accept preview_token JWT (query param) or session cookie.
	// The initial iframe load sends ?preview_token=..., but sub-resource requests
	// (CSS, JS, fonts, API calls) won't have the token — they use the cookie instead.
	token := r.URL.Query().Get("preview_token")
	hasValidToken := token != "" && h.verifyToken(token)
	hasValidCookie := !hasValidToken && h.verifySessionCookie(r, hostname)

	if !hasValidToken && !hasValidCookie {
		writeHTTPError(w, http.StatusUnauthorized, "Missing or invalid preview_token", "preview auth failed")
		return
	}

	// On first request with a valid token, set a session cookie for sub-resources
	if hasValidToken {
		h.setSessionCookie(w, hostname)
	}

	// Serve images directly from storage (Caddy handles this for direct access,
	// but the wildcard block routes everything through this proxy)
	if h.cfg.ImagesStorage != "" && strings.HasPrefix(r.URL.Path, "/_images/") {
		h.serveImage(w, r)
		return
	}

	// Look up port
	port, ok := h.ports.lookup(hostname)
	if !ok {
		writeHTTPError(w, http.StatusNotFound, "Site not found", "site port lookup failed")
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
				if err := h.injectNavScript(resp); err != nil {
					return fmt.Errorf("inject nav script: %w", err)
				}
			}
			return nil
		},
		ErrorHandler: func(rw http.ResponseWriter, req *http.Request, err error) {
			captureError(err, "reverse proxy error method=%s path=%s host=%s", req.Method, req.URL.Path, req.Host)
			writeHTTPError(rw, http.StatusBadGateway, "Bad gateway", "reverse proxy error")
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

// serveImage serves /_images/* directly from the storage directory.
// Matches Caddy's (image_serving) snippet behavior so preview iframes get images.
func (h *previewHandler) serveImage(w http.ResponseWriter, r *http.Request) {
	// Strip /_images/ prefix to get the storage-relative path
	relPath := strings.TrimPrefix(r.URL.Path, "/_images/")
	if relPath == "" {
		writeHTTPError(w, http.StatusNotFound, "Not found", "missing image path")
		return
	}

	// Prevent path traversal
	cleanPath := filepath.Clean(relPath)
	if strings.HasPrefix(cleanPath, "..") || filepath.IsAbs(cleanPath) {
		writeHTTPError(w, http.StatusBadRequest, "Invalid path", "path traversal in image request")
		return
	}

	fullPath := filepath.Join(h.cfg.ImagesStorage, cleanPath)

	// Verify the resolved path is still within storage root
	absPath, err := filepath.Abs(fullPath)
	if err != nil || !strings.HasPrefix(absPath, h.cfg.ImagesStorage) {
		writeHTTPError(w, http.StatusBadRequest, "Invalid path", "invalid absolute image path")
		return
	}

	// Match Caddy's cache headers from (image_serving) snippet
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

	// http.ServeFile handles MIME detection, range requests, conditional GETs
	http.ServeFile(w, r, fullPath)
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

// notFoundHTML is the HTML template for domains that don't exist.
// %s is replaced with the requested hostname.
const notFoundHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site Not Found</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fafafa;
    color: #111;
  }
  .container {
    text-align: center;
    max-width: 460px;
    padding: 2rem;
  }
  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }
  p {
    font-size: 1rem;
    color: #666;
    line-height: 1.6;
  }
  .domain {
    font-family: "SF Mono", "Fira Code", monospace;
    background: #f0f0f0;
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  a {
    color: #111;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
</head>
<body>
<div class="container">
  <h1>Site not found</h1>
  <p><span class="domain">%s</span> is not registered on this server.</p>
  <p style="margin-top: 1rem;"><a href="https://alive.best">alive.best</a></p>
</div>
</body>
</html>`

func (h *previewHandler) serveNotFound(w http.ResponseWriter, host string) {
	// Sanitize host for safe HTML embedding (prevent XSS)
	safe := strings.ReplaceAll(strings.ReplaceAll(host, "<", "&lt;"), ">", "&gt;")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprintf(w, notFoundHTML, safe)
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		captureMessage(sentry.LevelFatal, "[preview-proxy] required env var %s is not set", key)
		sentry.Flush(2 * time.Second)
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

func initSentry(service string) {
	dsn := os.Getenv("SENTRY_DSN")
	if dsn == "" {
		return
	}

	if err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      envOrDefault("STREAM_ENV", "unknown"),
		ServerName:       service,
		AttachStacktrace: true,
	}); err != nil {
		log.Printf("[preview-proxy] sentry init failed: %v", err)
	}
}

func captureError(err error, message string, args ...any) {
	if err == nil {
		return
	}
	msg := fmt.Sprintf(message, args...)
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelError)
		scope.SetTag("log_message", msg)
		sentry.CaptureException(err)
	})
}

func captureMessage(level sentry.Level, message string, args ...any) {
	msg := fmt.Sprintf(message, args...)
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(level)
		sentry.CaptureMessage(msg)
	})
}

func writeHTTPError(w http.ResponseWriter, statusCode int, body string, context string) {
	level := sentry.LevelError
	if statusCode < 500 {
		level = sentry.LevelWarning
	}
	captureMessage(level, "http_error status=%d context=%s message=%s", statusCode, context, body)
	http.Error(w, body, statusCode)
}
