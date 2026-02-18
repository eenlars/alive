package auth

import (
	"net/http"

	"shell-server-go/internal/session"
	"shell-server-go/internal/workspace"
)

// SessionWorkspace returns the pinned workspace bound to the current session.
func SessionWorkspace(r *http.Request, sessions *session.Store) string {
	return workspace.SessionWorkspace(r, sessions)
}
