#!/usr/bin/env bash
# Update the generated content in the Unity project (all of it is committed):
#   1. One of each catalog equipment type → convert and import all equipment models (every type placeable on the web has a model in Unity)
#   2. samples/datahall.usda (or the .usda given as an argument) → the layout.json the app opens by default
# Usage: tools/unity_sync.sh [file.usda]; requires .venv (usd-core), web/node_modules and Unity 6000.6.1f1
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
"$root/tools/check_lfs.sh" || exit 1
usd="${1:-$root/samples/datahall.usda}"
unity="${UNITY:-/Applications/Unity/Hub/Editor/6000.6.1f1/Unity.app/Contents/MacOS/Unity}"
py="$root/.venv/bin/python"
mkdir -p "$root/build"

import_bundle() {   # $1 bundle dir, $2 extra args
  "$unity" -batchmode -nographics -projectPath "$root/unity" -executeMethod DataHall.Editor.BundleImporter.ImportFromCommandLine \
    -bundle "$1" $2 -quit -logFile "$root/build/unity-sync.log" || { grep -E 'error|Exception' "$root/build/unity-sync.log" | head -20; exit 1; }
  grep 'DataHall:' "$root/build/unity-sync.log"
}

(cd "$root/web" && node scripts/all-types-usda.ts "$root/build/all-types.usda")
rm -rf "$root/build/unity-bundle-all" "$root/build/unity-bundle"
"$py" "$root/tools/usd_to_unity.py" "$root/build/all-types.usda" -o "$root/build/unity-bundle-all" --date 2026-09-17
import_bundle "$root/build/unity-bundle-all" -noLayout

date=$(grep -o 'usd_date_generated = "[0-9-]*"' "$usd" | grep -o '[0-9-]\{10\}' || date +%F)
"$py" "$root/tools/usd_to_unity.py" "$usd" -o "$root/build/unity-bundle" --date "$date"
import_bundle "$root/build/unity-bundle" ""
