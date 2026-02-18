package response

import (
	"encoding/json"
	"log"
	"net/http"

	"shell-server-go/internal/sentryx"
)

// JSON writes a JSON response payload with status code.
func JSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("response.JSON: failed to encode payload: %v", err)
		sentryx.CaptureError(err, "response.JSON: failed to encode payload")
	}
}
