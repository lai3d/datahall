#!/usr/bin/env bash
# 打包 macOS 程序到 build/DataHall.app，并用 batchmode 运行冒烟测试：打开默认 layout.json，输出统计后退出
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
unity="${UNITY:-/Applications/Unity/Hub/Editor/6000.6.1f1/Unity.app/Contents/MacOS/Unity}"
app="$root/build/DataHall.app"
mkdir -p "$root/build"
"$unity" -batchmode -nographics -projectPath "$root/unity" -executeMethod DataHall.Editor.BuildMac.Build \
  -buildPath "$app" -logFile "$root/build/unity-build.log" || { grep -E 'error|Error building' "$root/build/unity-build.log" | head -20; exit 1; }
grep 'DataHall: build' "$root/build/unity-build.log"
smoke="$root/build/smoke.json"
rm -f "$smoke"
"$app/Contents/MacOS/"* -batchmode -nographics -smokeTestOut "$smoke" -logFile "$root/build/smoke.log" ${LAYOUT:+-layout "$LAYOUT"} &
pid=$!
for _ in $(seq 1 60); do kill -0 $pid 2>/dev/null || break; sleep 1; done
kill $pid 2>/dev/null || true
python3 - "$smoke" "${LAYOUT:-}" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
print(json.dumps(report, ensure_ascii=False))
problems = []
if report.get("error"): problems.append(f"error: {report['error']}")
if report.get("renderPipeline") != "UniversalRenderPipelineAsset": problems.append("URP is not active")
if not sys.argv[2]:                                   # 默认布局就是 samples/datahall.usda
    expected = {"equipment": 17, "placeholders": 0, "renderers": 35, "gpus": 864, "itKw": 2542}
    problems += [f"{k}: want {v}, got {report.get(k)}" for k, v in expected.items() if report.get(k) != v]
    first = report.get("first") or {}
    if (first.get("name"), round(first.get("x", 0), 3), round(first.get("z", 0), 3)) != ("R04_C04", 2.7, -1.8):
        problems.append(f"R04_C04 position: {first}")
for p in problems: print("SMOKE FAIL", p)
sys.exit(1 if problems else 0)
PY
