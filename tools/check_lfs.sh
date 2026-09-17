#!/usr/bin/env bash
# Check that Git LFS-managed files have been pulled. If the repo was cloned without git-lfs, glb and similar files are
# just a few lines of text pointer, and the Unity import fails with confusing errors.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
pointers=$(git ls-files | git check-attr --stdin filter | awk -F': ' '$3 == "lfs" {print $1}' |
  while read -r f; do [ -f "$f" ] && head -c 40 "$f" | grep -q '^version https://git-lfs' && echo "$f"; done || true)
if [ -n "$pointers" ]; then
  echo "These files are still Git LFS pointers; their contents have not been pulled:" >&2
  echo "$pointers" | sed 's/^/  /' >&2
  echo "Run first: brew install git-lfs && git lfs install && git lfs pull" >&2
  exit 1
fi
