#!/bin/bash
# Configuration for static analysis checks (Makefile only - do not run directly)
#
# Each check is defined as: "id|description|script|enabled"
#   - id: unique identifier for the check
#   - description: human-readable name shown in output
#   - script: filename of the check script (must exist in scripts/validation/)
#   - enabled: true/false to enable/disable the check

declare -a CHECKS=(
    "workspace|Workspace validation|detect-workspace-issues.sh|true"
    "knip|Dead code detection (Knip)|check-knip.sh|false"
    "lint|Linting (Biome)|check-lint.sh|true"
    "types|Type checking (TypeScript)|check-types.sh|true"
    "patterns|Error pattern validation|check-error-patterns.sh|true"
    "dependencies|Dependency architecture (depcruise)|check-dependencies.sh|true"
    "file-length|File length limits|check-file-length.sh|true"
)

# Get enabled checks
get_enabled_checks() {
    local enabled_checks=()

    for check in "${CHECKS[@]}"; do
        IFS='|' read -r id description script enabled <<< "$check"

        if [ "$enabled" = "true" ]; then
            enabled_checks+=("$id|$description|$script")
        fi
    done

    printf '%s\n' "${enabled_checks[@]}"
}

# Count enabled checks
count_enabled_checks() {
    get_enabled_checks | wc -l | tr -d ' '
}
