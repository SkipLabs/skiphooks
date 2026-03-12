#!/usr/bin/env bash
# Run each test file in its own bun process.
# Bun's mock.module is process-wide, so test files that mock the same
# modules (e.g. @/src/lib/db/repository) interfere when run together.
set -euo pipefail

failed=0
total=0
for f in $(find src tests -name '*.test.ts' | sort); do
  total=$((total + 1))
  if ! bun test "$f" 2>&1; then
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo ""
  echo "FAILED: $failed/$total test files had failures"
  exit 1
else
  echo ""
  echo "OK: $total test files passed"
fi
