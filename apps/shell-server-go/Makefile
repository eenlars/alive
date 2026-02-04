.PHONY: build build-client build-server run dev clean test deps deploy

# Build everything (client + server)
build: build-client build-server

# Build the Go server (embeds client files)
# Output: shell-server-go (matches module name in go.mod)
# The systemd service expects this exact name: /etc/systemd/system/shell-server-go.service
build-server:
	go build -o shell-server-go .

# Build the client (Vite + Tailwind)
build-client:
	cd client && bun install && bun run build

# Run the server (requires SHELL_PASSWORD env var)
run: build
	./shell-server-go

# Development mode with auto-reload (requires air)
dev:
	@if command -v air > /dev/null; then \
		air; \
	else \
		echo "Installing air for hot-reload..."; \
		go install github.com/air-verse/air@latest; \
		air; \
	fi

# Install dependencies
deps:
	go mod download
	go mod tidy

# Clean build artifacts
clean:
	rm -rf bin/
	rm -rf client/node_modules
	rm -f .sessions.json .rate-limit-state.json

# Run tests
test:
	go test ./...

# Build for production (static binary with embedded files)
build-prod: build-client
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o shell-server-go .

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	@if command -v golangci-lint > /dev/null; then \
		golangci-lint run; \
	else \
		echo "golangci-lint not installed, skipping..."; \
	fi

# Deploy: build and restart the systemd service
deploy: build
	@echo "Restarting shell-server-go service..."
	systemctl restart shell-server-go
	@sleep 2
	@systemctl is-active --quiet shell-server-go && echo "✓ shell-server-go deployed successfully" || (echo "✗ shell-server-go failed to start" && systemctl status shell-server-go --no-pager && exit 1)
