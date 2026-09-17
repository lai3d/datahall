#!/usr/bin/env bash
# 把 samples/datahall.usda 转成布局包并导入 Unity 工程（生成的模型、prefab 变体、设备库和默认 layout.json 都提交进仓库）
# 用法：tools/unity_sync.sh [file.usda]；需要 .venv（usd-core）和 Unity 6000.6.1f1
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
usd="${1:-$root/samples/datahall.usda}"
unity="${UNITY:-/Applications/Unity/Hub/Editor/6000.6.1f1/Unity.app/Contents/MacOS/Unity}"
bundle="$root/build/unity-bundle"
date=$(grep -o 'usd_date_generated = "[0-9-]*"' "$usd" | grep -o '[0-9-]\{10\}' || date +%F)
rm -rf "$bundle"
"$root/.venv/bin/python" "$root/tools/usd_to_unity.py" "$usd" -o "$bundle" --date "$date"
"$unity" -batchmode -nographics -projectPath "$root/unity" -executeMethod DataHall.Editor.BundleImporter.ImportFromCommandLine \
  -bundle "$bundle" -quit -logFile "$root/build/unity-sync.log" || { grep -E 'error|Exception' "$root/build/unity-sync.log" | head -20; exit 1; }
grep 'DataHall:' "$root/build/unity-sync.log"
