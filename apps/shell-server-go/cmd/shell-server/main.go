package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"shell-server-go/internal/app"
)

func main() {
	clientFS, err := resolveClientFS()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to locate client assets: %v\n", err)
		os.Exit(1)
	}

	if err := app.Run(clientFS, ""); err != nil {
		fmt.Fprintf(os.Stderr, "server failed: %v\n", err)
		os.Exit(1)
	}
}

func resolveClientFS() (fs.FS, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("determine working directory: %w", err)
	}
	candidates := []string{
		filepath.Join(cwd, "dist", "client"),
		filepath.Join(cwd, "..", "..", "dist", "client"),
		filepath.Join(cwd, "apps", "shell-server-go", "dist", "client"),
	}

	for _, root := range candidates {
		indexPath := filepath.Join(root, "index.html")
		if info, err := os.Stat(indexPath); err == nil && !info.IsDir() {
			return os.DirFS(root), nil
		}
	}

	return nil, fmt.Errorf("index.html not found in candidates: %v", candidates)
}
