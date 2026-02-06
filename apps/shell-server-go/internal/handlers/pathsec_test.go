package handlers

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"shell-server-go/internal/config"
)

func TestPathResolver_ResolveSafePath(t *testing.T) {
	// Create temp directory for tests
	tmpDir, err := os.MkdirTemp("", "pathsec-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create some test files/dirs
	testDir := filepath.Join(tmpDir, "workspace")
	os.MkdirAll(testDir, 0755)
	os.MkdirAll(filepath.Join(testDir, "subdir"), 0755)
	os.WriteFile(filepath.Join(testDir, "file.txt"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(testDir, "subdir", "nested.txt"), []byte("nested"), 0644)

	cfg := &config.AppConfig{
		ResolvedUploadCwd: testDir,
		ResolvedSitesPath: tmpDir,
	}
	resolver := NewPathResolver(cfg)

	tests := []struct {
		name     string
		basePath string
		userPath string
		wantErr  error
		wantPath string // expected suffix of resolved path
	}{
		{
			name:     "simple file",
			basePath: testDir,
			userPath: "file.txt",
			wantPath: "file.txt",
		},
		{
			name:     "nested file",
			basePath: testDir,
			userPath: "subdir/nested.txt",
			wantPath: "subdir/nested.txt",
		},
		{
			name:     "directory",
			basePath: testDir,
			userPath: "subdir",
			wantPath: "subdir",
		},
		{
			name:     "non-existent file (allowed)",
			basePath: testDir,
			userPath: "newfile.txt",
			wantPath: "newfile.txt",
		},
		{
			name:     "path traversal with ..",
			basePath: testDir,
			userPath: "../etc/passwd",
			wantErr:  ErrPathTraversal,
		},
		{
			name:     "path traversal deeply nested",
			basePath: testDir,
			userPath: "subdir/../../etc/passwd",
			wantErr:  ErrPathTraversal,
		},
		{
			name:     "absolute path outside base",
			basePath: testDir,
			userPath: "/etc/passwd",
			wantErr:  ErrPathTraversal,
		},
		{
			name:     "empty path (base itself)",
			basePath: testDir,
			userPath: "",
			wantPath: "", // resolves to base
		},
		{
			name:     "dot path",
			basePath: testDir,
			userPath: ".",
			wantPath: "", // resolves to base
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolver.ResolveSafePath(tt.basePath, tt.userPath)

			if tt.wantErr != nil {
				if err == nil {
					t.Errorf("expected error %v, got nil", tt.wantErr)
					return
				}
				var pathErr *PathSecurityError
				if errors.As(err, &pathErr) {
					if !errors.Is(pathErr.Wrapped, tt.wantErr) {
						t.Errorf("expected error %v, got %v", tt.wantErr, pathErr.Wrapped)
					}
				} else {
					t.Errorf("expected PathSecurityError, got %T", err)
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if tt.wantPath != "" && !filepath.IsAbs(got) {
				t.Errorf("expected absolute path, got %s", got)
			}

			if tt.wantPath != "" && !pathEndsWith(got, tt.wantPath) {
				t.Errorf("expected path ending with %s, got %s", tt.wantPath, got)
			}
		})
	}
}

func TestPathResolver_ResolveWorkspaceBase(t *testing.T) {
	cfg := &config.AppConfig{
		ResolvedUploadCwd: "/uploads",
		ResolvedSitesPath: "/srv/sites",
	}
	resolver := NewPathResolver(cfg)

	tests := []struct {
		name      string
		workspace string
		want      string
		wantErr   error
	}{
		{
			name:      "root workspace",
			workspace: "root",
			want:      "/uploads",
		},
		{
			name:      "site: prefix",
			workspace: "site:example.com",
			want:      "/srv/sites/example.com/user",
		},
		{
			name:      "site: with subdomain",
			workspace: "site:sub.example.com",
			want:      "/srv/sites/sub.example.com/user",
		},
		{
			name:      "invalid site name - special chars",
			workspace: "site:../etc",
			wantErr:   ErrInvalidSiteName,
		},
		{
			name:      "invalid site name - starts with dot",
			workspace: "site:.hidden",
			wantErr:   ErrInvalidSiteName,
		},
		{
			name:      "plain domain (no prefix)",
			workspace: "example.com",
			want:      "/srv/sites/example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolver.ResolveWorkspaceBase(tt.workspace)

			if tt.wantErr != nil {
				if err == nil {
					t.Errorf("expected error, got nil")
					return
				}
				var pathErr *PathSecurityError
				if errors.As(err, &pathErr) {
					if !errors.Is(pathErr.Wrapped, tt.wantErr) {
						t.Errorf("expected error %v, got %v", tt.wantErr, pathErr.Wrapped)
					}
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if got != tt.want {
				t.Errorf("got %s, want %s", got, tt.want)
			}
		})
	}
}

func TestContainsTraversalPattern(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"file.txt", false},
		{"subdir/file.txt", false},
		{"../file.txt", true},
		{"subdir/../file.txt", true},
		{"...", false}, // three dots is not traversal
		{".hidden", false},
		{"a..b", false},     // double dot in filename is OK (not a path component)
		{"foo/a..b", false}, // double dot in filename is OK
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := ContainsTraversalPattern(tt.path); got != tt.want {
				t.Errorf("ContainsTraversalPattern(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestIsValidFilename(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"file.txt", true},
		{"my-file_v2.tar.gz", true},
		{".hidden", true},
		{"", false},
		{".", false},
		{"..", false},
		{"path/to/file", false},
		{"path\\to\\file", false},
		{"../evil", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsValidFilename(tt.name); got != tt.want {
				t.Errorf("IsValidFilename(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}

func TestSymlinkEscape(t *testing.T) {
	// Create temp directories
	tmpDir, err := os.MkdirTemp("", "symlink-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	workspace := filepath.Join(tmpDir, "workspace")
	outside := filepath.Join(tmpDir, "outside")
	os.MkdirAll(workspace, 0755)
	os.MkdirAll(outside, 0755)
	os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0644)

	// Create symlink pointing outside workspace
	symlinkPath := filepath.Join(workspace, "escape")
	if err := os.Symlink(outside, symlinkPath); err != nil {
		t.Skipf("cannot create symlink (might need elevated privileges): %v", err)
	}

	cfg := &config.AppConfig{
		ResolvedUploadCwd: workspace,
		ResolvedSitesPath: tmpDir,
	}
	resolver := NewPathResolver(cfg)

	// Try to access file through symlink
	_, err = resolver.ResolveSafePath(workspace, "escape/secret.txt")
	if err == nil {
		t.Error("expected error for symlink escape, got nil")
	}

	var pathErr *PathSecurityError
	if errors.As(err, &pathErr) {
		if !errors.Is(pathErr.Wrapped, ErrSymlinkEscape) {
			t.Errorf("expected ErrSymlinkEscape, got %v", pathErr.Wrapped)
		}
	} else {
		t.Errorf("expected PathSecurityError, got %T: %v", err, err)
	}
}

// Helper to check if path ends with suffix
func pathEndsWith(path, suffix string) bool {
	return filepath.Base(path) == filepath.Base(suffix) ||
		len(path) >= len(suffix) && path[len(path)-len(suffix):] == suffix
}
