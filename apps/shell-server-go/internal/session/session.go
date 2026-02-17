package session

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"shell-server-go/internal/logger"
)

const (
	// DefaultExpiration is the default session expiration time
	DefaultExpiration = 24 * time.Hour
	// CleanupInterval is how often expired sessions are cleaned up
	CleanupInterval = 5 * time.Minute
)

var log = logger.WithComponent("SESSION")

// Session represents a user session with metadata
type Session struct {
	Token      string `json:"token"`
	CreatedAt  int64  `json:"createdAt"`
	LastAccess int64  `json:"lastAccess"`
	ExpiresAt  int64  `json:"expiresAt"`
	Workspace  string `json:"workspace,omitempty"`
	UserAgent  string `json:"userAgent,omitempty"`
	RemoteAddr string `json:"remoteAddr,omitempty"`
}

// StoreConfig holds configuration for the session store
type StoreConfig struct {
	FilePath   string
	Expiration time.Duration
}

// Store manages session tokens with persistence and expiration
type Store struct {
	mu          sync.RWMutex
	sessions    map[string]*Session
	filePath    string
	expiration  time.Duration
	stopCleanup chan struct{}
	cleanupDone chan struct{}
}

// NewStore creates a new session store
func NewStore(filePath string) *Store {
	return NewStoreWithConfig(StoreConfig{
		FilePath:   filePath,
		Expiration: DefaultExpiration,
	})
}

// NewStoreWithConfig creates a new session store with custom config
func NewStoreWithConfig(cfg StoreConfig) *Store {
	if cfg.Expiration == 0 {
		cfg.Expiration = DefaultExpiration
	}

	s := &Store{
		sessions:    make(map[string]*Session),
		filePath:    cfg.FilePath,
		expiration:  cfg.Expiration,
		stopCleanup: make(chan struct{}),
		cleanupDone: make(chan struct{}),
	}

	if err := s.load(); err != nil {
		log.Warn("Failed to load sessions from disk: %v", err)
	}

	go s.cleanupLoop()

	return s
}

// load loads sessions from disk with error handling
func (s *Store) load() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // File doesn't exist yet, that's OK
		}
		return fmt.Errorf("read sessions file: %w", err)
	}

	// Try new format first (with metadata)
	var sessions []*Session
	if err := json.Unmarshal(data, &sessions); err != nil {
		// Try legacy format (just tokens array)
		var legacyTokens []string
		if err := json.Unmarshal(data, &legacyTokens); err != nil {
			return fmt.Errorf("unmarshal sessions: %w", err)
		}
		// Migrate legacy tokens
		now := time.Now().UnixMilli()
		for _, token := range legacyTokens {
			sessions = append(sessions, &Session{
				Token:      token,
				CreatedAt:  now,
				LastAccess: now,
				ExpiresAt:  now + int64(s.expiration.Milliseconds()),
			})
		}
		log.Info("Migrated %d legacy sessions to new format", len(legacyTokens))
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()
	loaded := 0
	expired := 0

	for _, session := range sessions {
		if session.ExpiresAt > now {
			s.sessions[session.Token] = session
			loaded++
		} else {
			expired++
		}
	}

	if expired > 0 {
		log.Info("Skipped %d expired sessions during load", expired)
	}

	return nil
}

// save saves sessions to disk atomically
func (s *Store) save() error {
	s.mu.RLock()
	sessions := make([]*Session, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}
	s.mu.RUnlock()

	data, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal sessions: %w", err)
	}

	// Atomic write: write to temp file, then rename
	dir := filepath.Dir(s.filePath)
	tempFile, err := os.CreateTemp(dir, ".sessions-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tempPath := tempFile.Name()

	// Clean up temp file on any error
	defer func() {
		if tempPath != "" {
			os.Remove(tempPath)
		}
	}()

	if _, err := tempFile.Write(data); err != nil {
		tempFile.Close()
		return fmt.Errorf("write temp file: %w", err)
	}

	if err := tempFile.Sync(); err != nil {
		tempFile.Close()
		return fmt.Errorf("sync temp file: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tempPath, s.filePath); err != nil {
		return fmt.Errorf("rename temp file: %w", err)
	}

	tempPath = "" // Clear so defer doesn't try to remove
	return nil
}

// cleanupLoop periodically removes expired sessions
func (s *Store) cleanupLoop() {
	defer close(s.cleanupDone)

	ticker := time.NewTicker(CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.cleanup()
		case <-s.stopCleanup:
			return
		}
	}
}

// cleanup removes expired sessions
func (s *Store) cleanup() {
	s.mu.Lock()

	now := time.Now().UnixMilli()
	expired := 0

	for token, session := range s.sessions {
		if session.ExpiresAt <= now {
			delete(s.sessions, token)
			expired++
		}
	}

	needsSave := expired > 0
	s.mu.Unlock()

	if needsSave {
		log.Debug("Cleaned up %d expired sessions", expired)
		if err := s.save(); err != nil {
			log.Error("Failed to save sessions after cleanup: %v", err)
		}
	}
}

// SessionInfo contains metadata for session creation
type SessionInfo struct {
	UserAgent  string
	RemoteAddr string
	Workspace  string
}

// Generate creates a new session token
func (s *Store) Generate() string {
	return s.GenerateWithInfo(SessionInfo{})
}

// GenerateWithInfo creates a new session token with metadata
func (s *Store) GenerateWithInfo(info SessionInfo) string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		log.Error("Failed to generate random bytes: %v", err)
		// Fallback to less secure but functional method
		for i := range bytes {
			bytes[i] = byte(time.Now().UnixNano() >> (i % 8))
		}
	}
	token := hex.EncodeToString(bytes)

	now := time.Now().UnixMilli()
	session := &Session{
		Token:      token,
		CreatedAt:  now,
		LastAccess: now,
		ExpiresAt:  now + int64(s.expiration.Milliseconds()),
		Workspace:  info.Workspace,
		UserAgent:  info.UserAgent,
		RemoteAddr: info.RemoteAddr,
	}

	s.mu.Lock()
	s.sessions[token] = session
	s.mu.Unlock()

	if err := s.save(); err != nil {
		log.Error("Failed to save session after generate: %v", err)
	}

	log.Debug("Generated new session (expires in %v)", s.expiration)
	return token
}

// Valid checks if a session token is valid and updates last access time
func (s *Store) Valid(token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[token]
	if !ok {
		return false
	}

	now := time.Now().UnixMilli()
	if session.ExpiresAt <= now {
		delete(s.sessions, token)
		go func() {
			if err := s.save(); err != nil {
				log.Error("Failed to save after removing expired session: %v", err)
			}
		}()
		return false
	}

	// Update last access time (don't save on every access for performance)
	session.LastAccess = now
	return true
}

// Touch updates the last access time and optionally extends expiration
func (s *Store) Touch(token string, extend bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[token]
	if !ok {
		return false
	}

	now := time.Now().UnixMilli()
	session.LastAccess = now

	if extend {
		session.ExpiresAt = now + int64(s.expiration.Milliseconds())
	}

	return true
}

// GetWorkspace returns the workspace bound to a session token, if any.
func (s *Store) GetWorkspace(token string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[token]
	if !ok {
		return "", false
	}

	now := time.Now().UnixMilli()
	if session.ExpiresAt <= now {
		delete(s.sessions, token)
		go func() {
			if err := s.save(); err != nil {
				log.Error("Failed to save after removing expired session: %v", err)
			}
		}()
		return "", false
	}

	return session.Workspace, true
}

// Delete removes a session token
func (s *Store) Delete(token string) {
	s.mu.Lock()
	_, existed := s.sessions[token]
	delete(s.sessions, token)
	s.mu.Unlock()

	if existed {
		if err := s.save(); err != nil {
			log.Error("Failed to save sessions after delete: %v", err)
		}
		log.Debug("Deleted session")
	}
}

// Count returns the number of active sessions
func (s *Store) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.sessions)
}

// Stop stops the cleanup goroutine and waits for it to finish
func (s *Store) Stop() {
	close(s.stopCleanup)
	<-s.cleanupDone
	log.Debug("Session store stopped")
}

// GetSession returns session metadata (for admin/debugging)
func (s *Store) GetSession(token string) *Session {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if session, ok := s.sessions[token]; ok {
		// Return a copy
		copy := *session
		return &copy
	}
	return nil
}

// ListSessions returns all sessions (for admin/debugging)
func (s *Store) ListSessions() []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sessions := make([]*Session, 0, len(s.sessions))
	for _, session := range s.sessions {
		copy := *session
		sessions = append(sessions, &copy)
	}
	return sessions
}
