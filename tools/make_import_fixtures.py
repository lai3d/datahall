#!/usr/bin/env python3
"""Generate web import test fixtures by round-tripping samples/datahall.usda through OpenUSD.

Usage: .venv/bin/python tools/make_import_fixtures.py   (needs usd-core)

pxr-resaved.usda  the sample re-saved by Sdf: canonical field order and number formatting
pxr-edited.usda   the sample edited through the Usd API the way a user might in usdview or Omniverse;
                  web/tests/usd-import.test.js asserts the expected import result for each edit
"""
import os
import sys

from pxr import Gf, Sdf, Usd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAMPLE = os.path.join(ROOT, "samples", "datahall.usda")
OUT = os.path.join(ROOT, "web", "tests", "fixtures")


def instance(stage, name, catalog_ref, col, row, translate=None, external=None):
    prim = stage.DefinePrim(f"/DataHall/Equipment/{name}", "Xform")
    prim.SetMetadata("kind", "component")
    prim.SetInstanceable(True)
    if external:
        prim.GetReferences().AddReference(*external)
    else:
        prim.GetReferences().AddInternalReference(catalog_ref)
    prim.CreateAttribute("dchall:gridColumn", Sdf.ValueTypeNames.Int).Set(col)
    prim.CreateAttribute("dchall:gridRow", Sdf.ValueTypeNames.Int).Set(row)
    x, y = (col - 7.5) * 0.6, -((row - 4.5) * 1.2)
    op = prim.CreateAttribute("xformOp:translate", Sdf.ValueTypeNames.Double3)
    op.Set(Gf.Vec3d(*(translate or (x, y, 0))))
    prim.CreateAttribute("xformOpOrder", Sdf.ValueTypeNames.TokenArray, variability=Sdf.VariabilityUniform).Set(["xformOp:translate"])
    return prim


def main():
    os.makedirs(OUT, exist_ok=True)
    Sdf.Layer.FindOrOpen(SAMPLE).Export(os.path.join(OUT, "pxr-resaved.usda"))

    layer = Sdf.Layer.OpenAsAnonymous(SAMPLE)
    stage = Usd.Stage.Open(layer)
    eq = "/DataHall/Equipment/"
    # 改了网格列但没改 translate：按网格列导入，提示 translate 不一致
    stage.GetPrimAtPath(eq + "R04_C04").GetAttribute("dchall:gridColumn").Set(0)
    # 在视口里拖动过：translate 变了，网格列排没变
    stage.GetPrimAtPath(eq + "R04_C05").GetAttribute("xformOp:translate").Set(Gf.Vec3d(-1.5, 3.0, 0))
    # 停用：不导入
    stage.GetPrimAtPath(eq + "R06_C04").SetActive(False)
    # 新增一台列间空调：正常导入
    instance(stage, "R10_C16", "/DataHall/Catalog/crah", 15, 9)
    # 目录里没有的类型、和 Kyber 重叠、超出网格、外部资产引用：都跳过
    instance(stage, "R10_C01", "/DataHall/Catalog/nope", 0, 9)
    instance(stage, "R08_C16", "/DataHall/Catalog/rpp", 14, 7)
    instance(stage, "R11_C01", "/DataHall/Catalog/rpp", 0, 10)
    instance(stage, "R01_C01", None, 0, 0, external=("./vendor/rack.usd", "/rack"))
    # 文件里的原型参数和目录不同：按目录计算，提示差异
    stage.GetPrimAtPath("/DataHall/Catalog/vr200").GetAttribute("dchall:powerKw").Set(230.0)
    layer.comment = 'edited in "usdview" # not a comment'
    layer.Export(os.path.join(OUT, "pxr-edited.usda"))
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
