#!/usr/bin/env bash
# 检查 Git LFS 管理的文件是否已拉取。没装 git-lfs 就克隆时，glb 等文件只是几行文本指针，Unity 导入会失败且报错难懂。
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
pointers=$(git ls-files | git check-attr --stdin filter | awk -F': ' '$3 == "lfs" {print $1}' |
  while read -r f; do [ -f "$f" ] && head -c 40 "$f" | grep -q '^version https://git-lfs' && echo "$f"; done || true)
if [ -n "$pointers" ]; then
  echo "这些文件还是 Git LFS 指针，没有拉取实际内容：" >&2
  echo "$pointers" | sed 's/^/  /' >&2
  echo "先运行：brew install git-lfs && git lfs install && git lfs pull" >&2
  exit 1
fi
