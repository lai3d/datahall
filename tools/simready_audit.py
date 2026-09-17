#!/usr/bin/env python3
"""Audit an exported data hall USD file against NVIDIA SimReady Foundation and the Omniverse Asset Validator.

Setup once: tools/simready_setup.sh
Usage:      .simready/venv/bin/python tools/simready_audit.py samples/datahall.usda [--json out.json]

Runs three passes and prints a table for each:
  1. every requirement in REQUIREMENTS, one feature per requirement, so a failure never hides another
  2. the Prop-Robotics-Neutral profile as published (closest official profile; physics features do not apply)
  3. all rules registered in usd_validation_nvidia (includes KindChecker, which no SimReady profile runs)

See docs/simready-audit.md for how to read the results.
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SCHEMA_DIR = os.path.abspath(os.path.join(ROOT, "schema"))
SPECS = os.path.abspath(os.path.join(ROOT, ".simready", "simready-foundation", "nv_core", "sr_specs", "docs"))
PROFILE, PROFILE_VERSION = "Prop-Robotics-Neutral", "2.1.0"

# 核对范围：单位、层级、命名与元数据、几何、材质、语义标签。物理、抓取、关节、打包不适用于机房布局文件
REQUIREMENTS = """
UN.001 UN.002 UN.003 UN.004 UN.005 UN.006 UN.007
HI.001 HI.002 HI.003 HI.004 HI.006 HI.008 HI.010
AA.001 AA.002
NP.001 NP.002 NP.003 NP.004 NP.005 NP.006 NP.007 NP.008
SR.001
VG.001 VG.002 VG.007 VG.008 VG.014 VG.023 VG.025 VG.026 VG.027 VG.028 VG.029 VG.MESH.001
VM.BIND.001 VM.BIND.002 VM.MAT.001 VM.PS.001
SL.001 SL.003
""".split()


def run_validate(asset, features_paths, profiles_path, profile, version, out):
    exe = os.path.join(os.path.dirname(sys.executable), "simready-validate")
    cmd = [exe, "--rules-path", os.path.join(SPECS, "capabilities"), "--profiles-path", profiles_path,
           "--profile", profile, "--version", version, "--output", out]
    for p in features_paths:
        cmd += ["--features-path", p]
    env = dict(os.environ, PXR_PLUGINPATH_NAME=SCHEMA_DIR)
    # 校验器的规则模块用相对 import，需要在规范仓库根目录运行
    proc = subprocess.run(cmd + [os.path.abspath(asset)], cwd=os.path.join(SPECS, "..", "..", ".."),
                          env=env, capture_output=True, text=True)
    skipped = [l for l in proc.stderr.splitlines() if l.startswith("ERROR:simready.validate:Skipping")]
    if skipped:
        raise RuntimeError("\n".join(skipped))
    with open(out) as f:
        return next(iter(json.load(f).values()))["features_summary"]


def summarize(messages, limit=2):
    """Collapse per-prim messages: replace prim paths and grid names so repeats count once."""
    norm = collections.Counter(
        re.sub(r"R\d\d_C\d\d", "Rxx_Cyy", re.sub(r"/private/\S+|/Users/\S+", "<file>", m)) for m in messages)
    return "; ".join(f"{n}x {t[:140]}" for t, n in norm.most_common(limit))


def messages_of(feature):
    return [m for ms in json.loads(feature.get("requirement_messages") or "{}").values() for m in ms]


def per_requirement(asset, tmp):
    feats = os.path.join(tmp, "features")
    os.makedirs(feats)
    fid = lambda r: "R_" + r.replace(".", "_")
    for r in REQUIREMENTS:
        with open(os.path.join(feats, fid(r) + ".json"), "w") as f:
            json.dump({"id": fid(r), "version": "0.1.0", "display_name": r, "path": "audit.html", "requirements": [r]}, f)
    profile = os.path.join(tmp, "datahall_audit.toml")
    with open(profile, "w") as f:
        f.write('[DataHall-Audit]\n"0.1.0" = {features = [\n')
        f.write(",\n".join(f'    {{"{fid(r)}" = {{version = "0.1.0"}}}}' for r in REQUIREMENTS))
        f.write("\n]}\n")
    summary = run_validate(asset, [os.path.join(SPECS, "features"), feats], profile, "DataHall-Audit", "0.1.0",
                           os.path.join(tmp, "requirements.json"))
    return {r: (summary[fid(r)]["passed"], summarize(messages_of(summary[fid(r)]))) for r in REQUIREMENTS}


def profile_pass(asset, tmp):
    summary = run_validate(asset, [os.path.join(SPECS, "features")], os.path.join(SPECS, "profiles"),
                           PROFILE, PROFILE_VERSION, os.path.join(tmp, "profile.json"))
    return {k: (v["passed"], summarize(messages_of(v), 1)) for k, v in sorted(summary.items())}


def oav_pass(asset):
    from pxr import Plug
    Plug.Registry().RegisterPlugins(SCHEMA_DIR)
    from usd_validation_nvidia import ValidationEngine
    engine = ValidationEngine(init_rules=True)
    issues = engine.validate(asset).issues()
    counts = collections.Counter(
        (str(i.severity).split(".")[-1], getattr(i.rule, "__name__", str(i.rule)),
         re.sub(r"/DataHall[\w/]*", "<path>", i.message)[:160]) for i in issues)
    return len(engine.rules), counts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("asset")
    ap.add_argument("--json", help="write all results to this file")
    args = ap.parse_args()
    if not os.path.isdir(SPECS):
        sys.exit("SimReady Foundation not found; run tools/simready_setup.sh first")

    with tempfile.TemporaryDirectory() as tmp:
        reqs = per_requirement(args.asset, tmp)
        prof = profile_pass(args.asset, tmp)
    n_rules, oav = oav_pass(args.asset)

    print(f"# {args.asset}\n\n## 逐条 requirement（{sum(p for p, _ in reqs.values())}/{len(reqs)} 通过）")
    for r, (passed, msg) in reqs.items():
        print(f"{r:12s} {'PASS' if passed else 'FAIL'}  {msg}")
    print(f"\n## {PROFILE} {PROFILE_VERSION}")
    for k, (passed, msg) in prof.items():
        print(f"{k:24s} {'PASS' if passed else 'FAIL'}  {msg}")
    print(f"\n## Omniverse Asset Validator：{n_rules} 条规则，{sum(oav.values())} 个问题")
    for (sev, rule, msg), n in sorted(oav.items()):
        print(f"{n:4d} {sev} {rule}: {msg}")

    if args.json:
        with open(args.json, "w") as f:
            json.dump({"requirements": reqs, "profile": prof,
                       "oav": [{"severity": s, "rule": r, "message": m, "count": n} for (s, r, m), n in oav.items()]},
                      f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
