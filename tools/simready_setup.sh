#!/usr/bin/env bash
# 准备 SimReady 核对环境：固定版本的 simready-foundation 规范仓库 + Python 3.12 venv（simready-validate 要求 3.12）
# 结果放在仓库根目录 .simready/（已 gitignore），之后运行 tools/simready_audit.py
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/.simready"
commit=0ed0dfbc539c9de99289771bd6848effe3ef5779   # 2026-08-03，VERSION 2026.06.0
mkdir -p "$dir"
if [ ! -d "$dir/simready-foundation/.git" ]; then
  git init -q "$dir/simready-foundation"
  git -C "$dir/simready-foundation" remote add origin https://github.com/NVIDIA/simready-foundation.git
fi
# 只需要规范文档和校验规则，不需要 LFS 里的样例资产
GIT_LFS_SKIP_SMUDGE=1 git -C "$dir/simready-foundation" fetch -q --depth 1 origin "$commit"
GIT_LFS_SKIP_SMUDGE=1 git -C "$dir/simready-foundation" checkout -q FETCH_HEAD
uv venv -q --allow-existing --python 3.12 "$dir/venv"
VIRTUAL_ENV="$dir/venv" uv pip install -q -r "$dir/simready-foundation/requirements.txt"
echo "ready: $dir/venv/bin/python tools/simready_audit.py samples/datahall.usda"
