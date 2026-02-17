package middleware

import (
	"net/http"

	"shell-server-go/internal/httpx/response"
	"shell-server-go/internal/session"
	"shell-server-go/internal/workspace"
)

const (
	DefaultMaxFormSize   = 32 << 20
	DefaultMaxUploadSize = 100 << 20
)

func ParseFormRequest(w http.ResponseWriter, r *http.Request) bool {
	return ParseFormRequestWithSize(w, r, DefaultMaxFormSize)
}

func ParseFormRequestWithSize(w http.ResponseWriter, r *http.Request, maxSize int64) bool {
	if err := r.ParseMultipartForm(maxSize); err != nil {
		if err := r.ParseForm(); err != nil {
			response.Error(w, http.StatusBadRequest, "Invalid request")
			return false
		}
	}
	return true
}

func GetWorkspace(r *http.Request) string {
	return workspace.WorkspaceFromRequestForm(r)
}

func GetWorkspaceQuery(r *http.Request) string {
	return workspace.WorkspaceFromRequestQuery(r)
}

func GetSessionWorkspace(r *http.Request, sessions *session.Store) string {
	return workspace.SessionWorkspace(r, sessions)
}

func GetWorkspaceForSession(r *http.Request, sessions *session.Store) string {
	return workspace.WorkspaceFromForm(r, sessions)
}

func GetWorkspaceQueryForSession(r *http.Request, sessions *session.Store) string {
	return workspace.WorkspaceFromQuery(r, sessions)
}
