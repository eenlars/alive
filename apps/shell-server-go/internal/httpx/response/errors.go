package response

import (
	"net/http"

	"github.com/getsentry/sentry-go"
	"shell-server-go/internal/sentryx"
)

// Error writes a standard JSON error envelope.
func Error(w http.ResponseWriter, statusCode int, message string) {
	sentryx.CaptureMessage(sentry.LevelError, "http_error status=%d message=%s", statusCode, message)
	JSON(w, statusCode, map[string]string{"error": message})
}

func Unauthorized(w http.ResponseWriter) {
	Error(w, http.StatusUnauthorized, "Unauthorized")
}

func BadRequest(w http.ResponseWriter, message string) {
	Error(w, http.StatusBadRequest, message)
}

func InternalServerError(w http.ResponseWriter) {
	Error(w, http.StatusInternalServerError, "Internal Server Error")
}
