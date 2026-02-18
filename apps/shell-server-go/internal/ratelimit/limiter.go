package ratelimit

// NewPersistentLimiter creates a file-backed login rate limiter.
func NewPersistentLimiter(filePath string) *Limiter {
	return NewLimiter(filePath)
}
