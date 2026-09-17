#!/usr/bin/env bash
# 运行 Unity EditMode 测试，结果写到 build/unity-editmode.xml，打印汇总和失败详情
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
"$root/tools/check_lfs.sh" || exit 1
unity="${UNITY:-/Applications/Unity/Hub/Editor/6000.6.1f1/Unity.app/Contents/MacOS/Unity}"
mkdir -p "$root/build"
results="$root/build/unity-editmode.xml"
rm -f "$results"
"$unity" -batchmode -nographics -projectPath "$root/unity" -runTests -testPlatform EditMode \
  -testResults "$results" -logFile "$root/build/unity-test.log"
code=$?
if [ ! -f "$results" ]; then
  grep -E 'error CS|Exception' "$root/build/unity-test.log" | sed -E 's#.*/Assets/#Assets/#' | sort -u | head -20
  exit 1
fi
python3 - "$results" <<'PY'
import sys, xml.etree.ElementTree as ET
run = ET.parse(sys.argv[1]).getroot()
print(f"EditMode: {run.get('passed')} passed, {run.get('failed')} failed, {run.get('skipped')} skipped, total {run.get('total')}")
for case in run.iter('test-case'):
    if case.get('result') != 'Passed':
        msg = case.find('failure/message')
        print('FAIL', case.get('fullname'), '\n   ', (msg.text or '').strip()[:400] if msg is not None else '')
PY
exit $code
