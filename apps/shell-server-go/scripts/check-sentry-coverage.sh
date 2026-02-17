#!/usr/bin/env bash
# Check that all error paths in shell-server-go report to Sentry.
#
# Safe error channels (already report to Sentry):
#   response.Error()          → sentryx.CaptureMessage
#   response.Unauthorized()   → response.Error → Sentry
#   response.BadRequest()     → response.Error → Sentry
#   response.InternalServerError() → response.Error → Sentry
#   logger.Error()            → sentryx.CaptureMessage (level >= ERROR)
#   logger.ErrorWithStack()   → sentryx.CaptureError
#   sentryx.CaptureError()    → direct
#   sentryx.CaptureMessage()  → direct
#
# Unsafe patterns (errors that bypass Sentry):
#   log.Printf / log.Println  → stdlib log, no Sentry
#   fmt.Fprintf(os.Stderr     → stderr only, no Sentry
#   http.Error(               → raw http, no Sentry
#   logger.Warn() with errors → warnings don't go to Sentry

set -euo pipefail

cd "$(dirname "$0")/.."

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

errors=0
warnings=0

check_pattern() {
  local pattern="$1"
  local description="$2"
  local severity="$3"  # error or warning
  # Additional grep -v patterns (pipe-separated)
  local exclude="${4:-}"

  local cmd="grep -rn --include='*.go' '$pattern' . --exclude-dir=vendor --exclude-dir=.cache"
  cmd="$cmd | grep -v '_test.go'"
  cmd="$cmd | grep -v 'internal/sentryx/'"
  cmd="$cmd | grep -v 'internal/logger/'"
  cmd="$cmd | grep -v 'internal/httpx/response/'"
  cmd="$cmd | grep -v 'test/testutil/'"

  if [[ -n "$exclude" ]]; then
    cmd="$cmd | grep -v '$exclude'"
  fi

  local files
  files=$(eval "$cmd" 2>/dev/null || true)

  if [[ -n "$files" ]]; then
    if [[ "$severity" == "error" ]]; then
      echo -e "${RED}ERROR: $description${NC}"
      errors=$((errors + 1))
    else
      echo -e "${YELLOW}WARNING: $description${NC}"
      warnings=$((warnings + 1))
    fi
    echo "$files" | while IFS= read -r line; do
      echo "  $line"
    done
    echo ""
  fi
}

echo "Checking Sentry error coverage in shell-server-go..."
echo ""

# Pattern 1: stdlib log.Printf/Println (bypasses Sentry)
# Excluded: response/json.go (has sentryx.CaptureError on same error)
check_pattern 'log\.Printf\|log\.Println\|log\.Fatalf' \
  "stdlib log calls bypass Sentry — use logger.Error() or sentryx.CaptureError() instead" \
  "error"

# Pattern 2: fmt.Fprintf(os.Stderr (bypasses Sentry)
# Excluded: main.go files that pair with sentryx.CaptureError on same error
check_pattern 'fmt\.Fprintf(os\.Stderr' \
  "fmt.Fprintf(os.Stderr) bypasses Sentry — add sentryx.CaptureError() or use logger.Error()" \
  "warning" \
  "cmd/shell-server/main\.go\|^./main\.go"

# Pattern 3: http.Error() instead of response.Error()
# Excluded: shutdown.go panic recovery (already has sentryx.CaptureMessage right before)
check_pattern 'http\.Error(' \
  "http.Error() bypasses Sentry — use response.Error() instead" \
  "error" \
  "shutdown\.go.*panic\|shutdown\.go.*Internal Server Error"

# Pattern 4: Direct WriteHeader(500) bypasses Sentry
check_pattern 'w\.WriteHeader(http\.StatusInternalServerError)' \
  "Direct WriteHeader(500) bypasses Sentry — use response.Error() or response.InternalServerError()" \
  "error"

# Pattern 5: Silently discarded errors (potential hidden failures)
# Excluded: deferred close/flush/stop, test code, strconv in templates (non-critical parsing)
check_pattern '_ = .*\.' \
  "Silently discarded error — verify this isn't hiding a failure that should go to Sentry" \
  "warning" \
  'defer\|\.Close()\|\.Flush()\|\.Stop()\|os\.Remove\|strconv\.'

echo "---"
if [[ $errors -eq 0 && $warnings -eq 0 ]]; then
  echo -e "${GREEN}All error paths are covered by Sentry.${NC}"
  exit 0
elif [[ $errors -eq 0 ]]; then
  echo -e "${YELLOW}$warnings warning(s), 0 errors. Review warnings above.${NC}"
  exit 0
else
  echo -e "${RED}$errors error(s), $warnings warning(s). Fix errors above.${NC}"
  exit 1
fi
