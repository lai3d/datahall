#!/usr/bin/env bash
# Set up the SimReady audit environment: a pinned simready-foundation spec repo + a Python 3.12 venv (simready-validate requires 3.12)
# Everything goes into .simready/ at the repo root (gitignored); afterwards run tools/simready_audit.py
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/.simready"
commit=0ed0dfbc539c9de99289771bd6848effe3ef5779   # 2026-08-03, VERSION 2026.06.0
mkdir -p "$dir"
if [ ! -d "$dir/simready-foundation/.git" ]; then
  git init -q "$dir/simready-foundation"
  git -C "$dir/simready-foundation" remote add origin https://github.com/NVIDIA/simready-foundation.git
fi
# Only the spec docs and validation rules are needed, not the sample assets in LFS
GIT_LFS_SKIP_SMUDGE=1 git -C "$dir/simready-foundation" fetch -q --depth 1 origin "$commit"
GIT_LFS_SKIP_SMUDGE=1 git -C "$dir/simready-foundation" checkout -q FETCH_HEAD
uv venv -q --allow-existing --python 3.12 "$dir/venv"
VIRTUAL_ENV="$dir/venv" uv pip install -q -r "$dir/simready-foundation/requirements.txt"
echo "ready: $dir/venv/bin/python tools/simready_audit.py samples/datahall.usda"
