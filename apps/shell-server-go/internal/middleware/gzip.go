package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"
)

// gzipResponseWriter wraps http.ResponseWriter to provide gzip compression
type gzipResponseWriter struct {
	io.Writer
	http.ResponseWriter
	wroteHeader bool
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		// Set content type if not already set
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", http.DetectContentType(b))
		}
		w.wroteHeader = true
	}
	return w.Writer.Write(b)
}

func (w *gzipResponseWriter) WriteHeader(code int) {
	w.wroteHeader = true
	// Remove Content-Length since we're compressing
	w.Header().Del("Content-Length")
	w.ResponseWriter.WriteHeader(code)
}

// Pool for gzip writers to reduce allocations
var gzipPool = sync.Pool{
	New: func() interface{} {
		w, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
		return w
	},
}

// compressibleTypes are MIME types that benefit from compression
var compressibleTypes = map[string]bool{
	"text/html":                true,
	"text/css":                 true,
	"text/plain":               true,
	"text/javascript":          true,
	"text/xml":                 true,
	"application/javascript":   true,
	"application/json":         true,
	"application/xml":          true,
	"application/xhtml+xml":    true,
	"application/rss+xml":      true,
	"application/atom+xml":     true,
	"image/svg+xml":            true,
	"application/x-javascript": true,
}

// shouldCompress checks if the request path should be compressed
func shouldCompress(path string) bool {
	// Compress JS and CSS files
	if strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".css") {
		return true
	}
	// Compress HTML
	if strings.HasSuffix(path, ".html") || strings.HasSuffix(path, ".htm") {
		return true
	}
	// Compress JSON
	if strings.HasSuffix(path, ".json") {
		return true
	}
	// Compress SVG
	if strings.HasSuffix(path, ".svg") {
		return true
	}
	return false
}

// Gzip returns middleware that compresses responses using gzip
func Gzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if client accepts gzip
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		// Only compress certain paths/types
		if !shouldCompress(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		// Get gzip writer from pool
		gz := gzipPool.Get().(*gzip.Writer)
		gz.Reset(w)
		defer func() {
			gz.Close()
			gzipPool.Put(gz)
		}()

		// Set headers
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Vary", "Accept-Encoding")

		// Wrap response writer
		gzw := &gzipResponseWriter{
			Writer:         gz,
			ResponseWriter: w,
		}

		next.ServeHTTP(gzw, r)
	})
}
