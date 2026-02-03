package ratelimit

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

const (
	MaxAttempts     = 40               // Max failed attempts before lockout
	AttemptWindow   = 10 * time.Minute // 10 minute sliding window
	LockoutDuration = 15 * time.Minute // 15 minute lockout after max attempts
	CleanupInterval = 2 * time.Minute  // Cleanup every 2 minutes
)

// State represents the rate limit state
type State struct {
	FailedAttempts []int64 `json:"failedAttempts"`
	LockedUntil    *int64  `json:"lockedUntil"`
}

// Limiter manages rate limiting
type Limiter struct {
	mu             sync.Mutex
	failedAttempts []int64
	lockedUntil    *int64
	filePath       string
	stopCleanup    chan struct{}
}

// Result represents the result of a rate limit check
type Result struct {
	Limited           bool
	WaitMinutes       int
	AttemptsRemaining int
}

// NewLimiter creates a new rate limiter
func NewLimiter(filePath string) *Limiter {
	l := &Limiter{
		failedAttempts: []int64{},
		filePath:       filePath,
		stopCleanup:    make(chan struct{}),
	}
	l.load()
	go l.cleanupLoop()
	return l
}

// load loads state from disk
func (l *Limiter) load() {
	data, err := os.ReadFile(l.filePath)
	if err != nil {
		return
	}

	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	l.failedAttempts = state.FailedAttempts
	l.lockedUntil = state.LockedUntil
}

// save saves state to disk
func (l *Limiter) save() {
	state := State{
		FailedAttempts: l.failedAttempts,
		LockedUntil:    l.lockedUntil,
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(l.filePath, data, 0644)
}

// cleanupLoop periodically cleans up old attempts
func (l *Limiter) cleanupLoop() {
	ticker := time.NewTicker(CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			l.cleanup()
		case <-l.stopCleanup:
			return
		}
	}
}

// cleanup removes old failed attempts
func (l *Limiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now().UnixMilli()
	cutoff := now - int64(AttemptWindow.Milliseconds())
	beforeLen := len(l.failedAttempts)

	// Remove old attempts
	filtered := make([]int64, 0, len(l.failedAttempts))
	for _, ts := range l.failedAttempts {
		if ts >= cutoff {
			filtered = append(filtered, ts)
		}
	}
	l.failedAttempts = filtered

	if len(l.failedAttempts) != beforeLen {
		l.save()
	}
}

// Check checks if the system is rate limited
func (l *Limiter) Check() Result {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now().UnixMilli()

	// Check lockout
	if l.lockedUntil != nil && now < *l.lockedUntil {
		waitMs := *l.lockedUntil - now
		waitMinutes := int((waitMs + 59999) / 60000) // Round up
		return Result{Limited: true, WaitMinutes: waitMinutes}
	} else if l.lockedUntil != nil && now >= *l.lockedUntil {
		// Lockout expired
		l.lockedUntil = nil
		l.failedAttempts = []int64{}
		l.save()
	}

	// Count recent attempts
	cutoff := now - int64(AttemptWindow.Milliseconds())
	recent := make([]int64, 0, len(l.failedAttempts))
	for _, ts := range l.failedAttempts {
		if ts >= cutoff {
			recent = append(recent, ts)
		}
	}
	l.failedAttempts = recent

	remaining := MaxAttempts - len(l.failedAttempts)

	if len(l.failedAttempts) >= MaxAttempts {
		lockTime := now + int64(LockoutDuration.Milliseconds())
		l.lockedUntil = &lockTime
		waitMinutes := int(LockoutDuration.Minutes())
		l.save()
		return Result{Limited: true, WaitMinutes: waitMinutes}
	}

	return Result{Limited: false, AttemptsRemaining: remaining}
}

// RecordFailure records a failed login attempt
func (l *Limiter) RecordFailure() int {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now().UnixMilli()
	l.failedAttempts = append(l.failedAttempts, now)
	remaining := MaxAttempts - len(l.failedAttempts)
	l.save()
	return remaining
}

// Clear clears all failed attempts (on successful login)
func (l *Limiter) Clear() {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.failedAttempts = []int64{}
	l.lockedUntil = nil
	l.save()
}

// Stop stops the cleanup loop
func (l *Limiter) Stop() {
	close(l.stopCleanup)
}
