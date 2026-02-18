package session

import "time"

// NewPersistentStore creates a file-backed session store.
func NewPersistentStore(filePath string) *Store {
	return NewStore(filePath)
}

// NewStoreWithTTL creates a file-backed session store with a custom expiration.
func NewStoreWithTTL(filePath string, ttl time.Duration) *Store {
	return NewStoreWithConfig(StoreConfig{FilePath: filePath, Expiration: ttl})
}
