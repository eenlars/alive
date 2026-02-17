package main

import (
	"fmt"
	"os"

	"shell-server-go/internal/app"
)

func main() {
	clientFS, err := GetEmbeddedClientFS()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load embedded client files: %v\n", err)
		os.Exit(1)
	}

	if err := app.Run(clientFS, ""); err != nil {
		fmt.Fprintf(os.Stderr, "server failed: %v\n", err)
		os.Exit(1)
	}
}
