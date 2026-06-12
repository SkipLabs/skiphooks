#!/usr/bin/env bash
set -euo pipefail

echo "▶ bun run test"
bun run test

echo "▶ bun run lint"
bun run lint

echo "▶ bun run build"
bun run build
