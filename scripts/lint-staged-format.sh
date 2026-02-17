#!/usr/bin/env bash
set -euo pipefail

root_files=()
alrighty_files=()

for f in "$@"; do
  if [[ "$f" == packages/alrighty/* || "$f" == */packages/alrighty/* ]]; then
    alrighty_files+=("${f#*packages/alrighty/}")
  elif [[ "$f" == *apps/shell-server-go/* ]]; then
    # Skip: biome formatting disabled for Go app's client files
    continue
  else
    root_files+=("$f")
  fi
done

if [[ ${#root_files[@]} -gt 0 ]]; then
  biome format --write --config-path=./biome.json "${root_files[@]}"
fi

if [[ ${#alrighty_files[@]} -gt 0 ]]; then
  (
    cd packages/alrighty
    biome format --write "${alrighty_files[@]}"
  )
fi
