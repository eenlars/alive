package terminal

import "testing"

func TestIsAllowedWebSocketOrigin(t *testing.T) {
	tests := []struct {
		name   string
		origin string
		host   string
		want   bool
	}{
		{
			name:   "allows empty origin",
			origin: "",
			host:   "go.sonno.tech",
			want:   true,
		},
		{
			name:   "rejects malformed origin",
			origin: "://bad",
			host:   "go.sonno.tech",
			want:   false,
		},
		{
			name:   "allows same host origin",
			origin: "https://go.sonno.tech",
			host:   "go.sonno.tech",
			want:   true,
		},
		{
			name:   "allows localhost origin",
			origin: "http://localhost:3000",
			host:   "go.sonno.tech",
			want:   true,
		},
		{
			name:   "allows base domain apex origin",
			origin: "https://sonno.tech",
			host:   "go.sonno.tech",
			want:   true,
		},
		{
			name:   "allows subdomain origin",
			origin: "https://app.sonno.tech",
			host:   "go.sonno.tech",
			want:   true,
		},
		{
			name:   "rejects unrelated domain",
			origin: "https://evil.example",
			host:   "go.sonno.tech",
			want:   false,
		},
		{
			name:   "allows apex for alive.best style host",
			origin: "https://alive.best",
			host:   "go.alive.best",
			want:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAllowedWebSocketOrigin(tt.origin, tt.host)
			if got != tt.want {
				t.Fatalf("isAllowedWebSocketOrigin(%q, %q) = %v, want %v", tt.origin, tt.host, got, tt.want)
			}
		})
	}
}
