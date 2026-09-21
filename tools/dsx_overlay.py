#!/usr/bin/env python3
"""Swap real SimReady equipment assets into an exported data hall, on your own machine.

Usage: .venv/bin/python tools/dsx_overlay.py datahall.usda \\
           --asset gb300=/path/to/dsx/.../GB300.usd --asset cdu=/path/to/dsx/.../XDU2300.usd \\
           [-o datahall_dsx.usda] [--rotate -90]

Writes a small override layer next to the output path. The layer sublayers the exported hall and, for each
`<catalog id>=<asset>` pair, deactivates the simplified Body and Front meshes of /DataHall/Catalog/<id> and adds a
child Xform that references the asset, rotated so an asset facing +X (the AI Factory asset convention) faces the
hall's -Y front, with kind = "subcomponent" (docs/simready-audit.md, approach B). Every instance follows, since the
instances reference the catalog prototypes. Open the result in usdview or Omniverse, or convert it for Unity with
tools/usd_to_unity.py, which honors the overrides.

The assets are only referenced by path: nothing is copied, and the layer is meant to stay on the machine that has
the assets. The NVIDIA DSX content pack is licensed for internal evaluation only (NVIDIA Sample Data License for
Evaluation), so neither the assets nor anything derived from them belongs in this repository or on the website.

After writing, the composed hall is checked: for each swapped type, the footprint of its first placed instance is
compared with the grid cell (0.6 m wide along X, 1.2 m deep along Y) and printed, so a wrong orientation or unit
shows up at once. Assets in other units are scaled by their metersPerUnit; a Y-up asset is rotated to Z-up.
"""
import argparse
import os
import sys

from pxr import Gf, Kind, Sdf, Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate_usd  # noqa: E402

CELL = (0.6, 1.2)          # grid cell, X × Y, meters
TOLERANCE = 0.15           # a footprint this much larger than the cell (share) gets a warning
MODEL = "simready_model"   # name of the child that references the asset


class OverlayError(Exception):
    pass


def parse_assets(pairs):
    assets = {}
    for pair in pairs:
        if "=" not in pair:
            raise OverlayError(f"--asset needs <catalog id>=<path>, got {pair!r}")
        type_id, path = pair.split("=", 1)
        if not os.path.isfile(path):
            raise OverlayError(f"{type_id}: no such file {path}")
        assets[type_id] = os.path.abspath(path)
    if not assets:
        raise OverlayError("give at least one --asset <catalog id>=<path>")
    return assets


def asset_frame(path):
    """Scale and extra rotation that bring an asset to meters and Z up."""
    stage = Usd.Stage.Open(path, load=Usd.Stage.LoadNone)
    if not stage.GetDefaultPrim():
        raise OverlayError(f"{path} has no defaultPrim, so it cannot be referenced without a prim path")
    mpu = UsdGeom.GetStageMetersPerUnit(stage)
    y_up = UsdGeom.GetStageUpAxis(stage) == UsdGeom.Tokens.y
    return mpu, y_up


def build_overlay(hall, assets, out, rotate=-90.0):
    """Write the override layer and return it; raises OverlayError for a type the hall does not use."""
    # Before the first stage opens: the schema registry is built once, on first use
    validate_usd.register_schemas()
    hall_stage = Usd.Stage.Open(hall)
    catalog = hall_stage.GetPrimAtPath("/DataHall/Catalog")
    if not catalog:
        raise OverlayError(f"{hall} has no /DataHall/Catalog; export it from the web app first")
    for type_id in assets:
        if not catalog.GetChild(type_id):
            used = ", ".join(sorted(c.GetName() for c in catalog.GetChildren() if c.GetName() != "Looks"))
            raise OverlayError(f"the hall has no {type_id} devices (it uses: {used})")

    here = os.path.dirname(os.path.abspath(out))
    def rel(p):
        r = os.path.relpath(os.path.abspath(p), here).replace(os.sep, "/")
        return r if r.startswith(".") else "./" + r
    layer = Sdf.Layer.CreateNew(out) if not os.path.exists(out) else Sdf.Layer.FindOrOpen(out)
    layer.Clear()
    layer.subLayerPaths.append(rel(hall))
    layer.defaultPrim = "DataHall"
    stage = Usd.Stage.Open(layer)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    for type_id, path in sorted(assets.items()):
        mpu, y_up = asset_frame(path)
        base = f"/DataHall/Catalog/{type_id}"
        for child in ("Body", "Front"):
            stage.OverridePrim(f"{base}/{child}").SetActive(False)
        model = UsdGeom.Xform.Define(stage, f"{base}/{MODEL}")
        Usd.ModelAPI(model.GetPrim()).SetKind(Kind.Tokens.subcomponent)
        model.GetPrim().GetReferences().AddReference(rel(path))
        model.AddRotateXYZOp().Set(Gf.Vec3f(90.0 if y_up else 0.0, 0.0, rotate))
        if abs(mpu - 1.0) > 1e-9:
            model.AddScaleOp().Set(Gf.Vec3f(mpu, mpu, mpu))
    layer.Save()
    return layer


def footprints(out, types):
    """World-space X × Y size and height of the first placed instance of each type, in the composed overlay."""
    stage = Usd.Stage.Open(out)
    cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), [UsdGeom.Tokens.default_, UsdGeom.Tokens.render])
    found = {}
    equipment = stage.GetPrimAtPath("/DataHall/Equipment")
    for prim in equipment.GetChildren() if equipment else []:
        refs = [r for spec in prim.GetPrimStack() for r in spec.referenceList.GetAddedOrExplicitItems()]
        type_id = next((r.primPath.name for r in refs if str(r.primPath).startswith("/DataHall/Catalog/")), None)
        if type_id in types and type_id not in found:
            box = cache.ComputeWorldBound(prim).ComputeAlignedRange()
            size = box.GetSize()
            found[type_id] = (size[0], size[1], size[2])
    return found


def check(out, types):
    """Lines describing each swapped type's footprint against the grid cell; warnings start with 'warning:'."""
    lines = []
    for type_id, (sx, sy, sz) in sorted(footprints(out, types).items()):
        line = f"{type_id}: {sx:.2f} m wide (X) × {sy:.2f} m deep (Y) × {sz:.2f} m high; the cell is {CELL[0]} × {CELL[1]} m"
        if sx > sy * 1.2 and sy < CELL[1] * .8:
            line += "\n  warning: wider than deep, so the asset probably faces another way; try --rotate 0, 90 or 180"
        elif sx > CELL[0] * (1 + TOLERANCE) or sy > CELL[1] * (1 + TOLERANCE):
            line += "\n  warning: larger than one cell, so it overlaps its neighbours (the hall grid does not model multi-cell devices)"
        lines.append(line)
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("hall", help="a .usda exported from the web app")
    ap.add_argument("--asset", action="append", default=[], metavar="ID=PATH", help="catalog id and the asset to use for it")
    ap.add_argument("-o", "--out", help="override layer to write (default: <hall>_dsx.usda next to the hall)")
    ap.add_argument("--rotate", type=float, default=-90.0, help="rotation about Z in degrees (default -90: +X front to -Y)")
    args = ap.parse_args(argv)
    out = args.out or os.path.splitext(args.hall)[0] + "_dsx.usda"
    try:
        assets = parse_assets(args.asset)
        build_overlay(args.hall, assets, out, args.rotate)
    except OverlayError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"wrote {out}")
    for line in check(out, set(assets)):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
