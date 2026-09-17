#!/usr/bin/env bash
# 从 schema/schema.usda 重新生成 schema/generatedSchema.usda 和 schema/plugInfo.json
# 需要 usd-core 和 jinja2，默认用仓库根目录的 .venv，可用 PYTHON=... 覆盖
# 额外参数传给 usdGenSchema，例如 --validate 检查生成文件是否过期
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
PY="${PYTHON:-$root/.venv/bin/python}"
[ -x "$PY" ] || PY=python3
cd "$root/schema"
"$PY" -m pxr.Usd.usdGenSchema "$@" schema.usda .
