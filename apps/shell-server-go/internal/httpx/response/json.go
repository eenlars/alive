package response

import (
	"encoding/json"
	"net/http"
)

// JSON writes a JSON response payload with status code.
func JSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
