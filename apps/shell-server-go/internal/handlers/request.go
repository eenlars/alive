package handlers

import (
	"net/http"
)

const (
	// DefaultMaxFormSize is the default max size for form parsing (32MB)
	DefaultMaxFormSize = 32 << 20
	// DefaultMaxUploadSize is the default max size for file uploads (100MB)
	DefaultMaxUploadSize = 100 << 20
)

// ParseFormRequest parses either multipart or regular form data
// Returns true if parsing succeeded, false if error response was sent
func ParseFormRequest(w http.ResponseWriter, r *http.Request) bool {
	return ParseFormRequestWithSize(w, r, DefaultMaxFormSize)
}

// ParseFormRequestWithSize parses form data with custom size limit
func ParseFormRequestWithSize(w http.ResponseWriter, r *http.Request, maxSize int64) bool {
	if err := r.ParseMultipartForm(maxSize); err != nil {
		if err := r.ParseForm(); err != nil {
			jsonError(w, "Invalid request", http.StatusBadRequest)
			return false
		}
	}
	return true
}

// GetWorkspace extracts workspace from request, defaulting to "root"
func GetWorkspace(r *http.Request) string {
	workspace := r.FormValue("workspace")
	if workspace == "" {
		return "root"
	}
	return workspace
}
