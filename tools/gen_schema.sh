#!/usr/bin/env bash
# Regenerate schema/generatedSchema.usda and schema/plugInfo.json from schema/schema.usda
# Requires usd-core and jinja2; uses .venv at the repo root by default, override with PYTHON=...
# Extra arguments are passed to usdGenSchema, e.g. --validate checks whether the generated files are stale
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
PY="${PYTHON:-$root/.venv/bin/python}"
[ -x "$PY" ] || PY=python3
cd "$root/schema"
"$PY" -m pxr.Usd.usdGenSchema "$@" schema.usda .
