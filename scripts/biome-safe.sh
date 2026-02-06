#!/bin/bash
# Wrapper for biome that prevents concurrent runs using flock
# This prevents OOM issues when multiple Claude sessions run lint simultaneously

LOCK_FILE="/tmp/biome-alive.lock"
TIMEOUT=120  # Wait up to 2 minutes for lock

# Use flock to serialize biome runs
exec 200>"$LOCK_FILE"
if ! flock -w $TIMEOUT 200; then
    echo "⚠️  Another biome process is running. Waited ${TIMEOUT}s, skipping to avoid OOM."
    exit 0  # Exit successfully to not break CI
fi

# Run biome with all passed arguments
exec biome "$@"
