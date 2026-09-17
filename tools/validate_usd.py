#!/usr/bin/env python3
"""Validate an exported data hall USD file.

Usage: pip install usd-core && python tools/validate_usd.py samples/datahall.usda
"""
import sys
from pxr import Usd, UsdGeom

def main(path: str) -> int:
    stage = Usd.Stage.Open(path)
    errors = []
    if UsdGeom.GetStageUpAxis(stage) != UsdGeom.Tokens.z:
        errors.append("upAxis must be Z")
    if UsdGeom.GetStageMetersPerUnit(stage) != 1.0:
        errors.append("metersPerUnit must be 1")
    hall = stage.GetDefaultPrim()
    if not hall or hall.GetName() != "DataHall":
        errors.append("defaultPrim must be /DataHall")
        return report(errors)

    equipment = stage.GetPrimAtPath("/DataHall/Equipment")
    kids = list(equipment.GetChildren()) if equipment else []
    for p in kids:
        if not p.IsInstance():
            errors.append(f"{p.GetPath()}: not instanceable")
        if p.GetAttribute("dchall:powerKw").Get() is None:
            errors.append(f"{p.GetPath()}: missing dchall:powerKw")
        for rel in ("dchall:coolantSource", "dchall:powerFeed"):
            r = p.GetRelationship(rel)
            for t in (r.GetTargets() if r else []):
                if not stage.GetPrimAtPath(t):
                    errors.append(f"{p.GetPath()}: {rel} -> missing {t}")

    kw = sum(p.GetAttribute("dchall:powerKw").Get() or 0 for p in kids)
    gpus = sum(p.GetAttribute("dchall:gpuCount").Get() or 0 for p in kids)
    bbox = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ["default"]).ComputeWorldBound(hall).ComputeAlignedRange()
    print(f"equipment={len(kids)} it_load_kw={kw:.0f} gpus={gpus} bbox={bbox}")
    return report(errors)

def report(errors):
    for e in errors:
        print("ERROR", e)
    print("OK" if not errors else f"{len(errors)} error(s)")
    return 1 if errors else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "samples/datahall.usda"))
