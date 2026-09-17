#!/usr/bin/env bash
# Native plugin smoke test (the app window pops up for a few seconds): file drag and drop, file dialog, keeping the hall when opening fails.
# Run tools/unity_build.sh first. The system drag gesture and picking a file in the dialog cannot be automated; try them by hand once.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/build/DataHall.app"
out="$root/build/native-smoke.json"
drop="$root/build/native-smoke-layout.json"
(cd "$root/web" && node --input-type=module -e "
import {writeFileSync} from 'node:fs';
import {buildLayout, layoutToText} from './src/layout-export.ts';
import {CAT} from './src/catalog.ts'; import {GRID} from './src/grid.ts'; import {PRESETS} from './src/layout.ts';
const p = PRESETS.rubin;
writeFileSync('$drop', layoutToText(buildLayout(p.list.map(([type, x, z]) => ({type, x, z})), CAT, p.u, GRID, {date: '2026-09-17'})));")
rm -f "$out"
"$app/Contents/MacOS/"* -nativeSmokeOut "$out" -nativeSmokeLayout "$drop" -logFile "$root/build/native-smoke.log" >/dev/null 2>&1 &
pid=$!
for _ in $(seq 1 60); do kill -0 $pid 2>/dev/null || break; sleep 1; done
kill $pid 2>/dev/null || true
python3 - "$out" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
print(json.dumps(r))
want = {"version": 1, "dropReady": True, "testDropAccepted": True, "sourceAfterDrop": "native-smoke-layout.json",
        "equipmentAfterDrop": 22, "dialogCancelledToNull": True, "failedOpenKeepsHall": True}
bad = [f"{k}: want {v}, got {r.get(k)}" for k, v in want.items() if r.get(k) != v]
for b in bad: print("NATIVE SMOKE FAIL", b)
sys.exit(1 if bad else 0)
PY
