package terminal

import (
	"strings"
	"testing"
)

func TestBuildTerminalEnv_RunAsOwnerFiltersDangerousVars(t *testing.T) {
	base := []string{
		"TERM=screen",
		"HOME=/root",
		"PATH=/custom/bin",
		"BASH_ENV=/tmp/hook.sh",
		"ENV=/tmp/env.sh",
		"PROMPT_COMMAND=echo hi",
		"CDPATH=/",
		"GLOBIGNORE=*",
		"SHELLOPTS=extglob",
		"KEEP=1",
	}

	got := buildTerminalEnv(base, "/srv/webalive/sites/example.com/user", true)
	joined := strings.Join(got, "\n")

	for _, banned := range []string{
		"BASH_ENV=",
		"ENV=",
		"PROMPT_COMMAND=",
		"CDPATH=",
		"GLOBIGNORE=",
		"SHELLOPTS=",
		"PATH=/custom/bin",
		"HOME=/root",
	} {
		if strings.Contains(joined, banned) {
			t.Fatalf("expected %q to be filtered, got env: %v", banned, got)
		}
	}

	for _, required := range []string{
		"TERM=xterm-256color",
		"HOME=/srv/webalive/sites/example.com/user",
		"PATH=/usr/local/bin:/usr/bin:/bin",
		"KEEP=1",
	} {
		if !strings.Contains(joined, required) {
			t.Fatalf("expected %q in env, got: %v", required, got)
		}
	}
}
