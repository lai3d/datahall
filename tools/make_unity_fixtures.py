#!/usr/bin/env python3
"""Generate the Unity axis probe fixture: a glb whose markers sit in known USD directions.

Usage: .venv/bin/python tools/make_unity_fixtures.py   (needs usd-core)

The probe prototype has three small boxes: marker_x at USD (1, 0, 0.5) with baked points,
marker_front at (0, -1, 0.5) through xformOp:translate, marker_up at (0, 0, 2) through
translate and scale. unity/Assets/DataHall/Tests/EditMode/AxisProbeTests.cs checks that glTFast
places them where HallCoordinates.UsdToUnity says, which pins the whole USD -> glTF -> Unity chain.
"""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usd_to_unity  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "unity", "Assets", "DataHall", "Tests", "EditMode", "Fixtures")

FACES = """        int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
        int[] faceVertexIndices = [0, 3, 2, 1, 4, 5, 6, 7, 0, 1, 5, 4, 2, 3, 7, 6, 1, 2, 6, 5, 3, 0, 4, 7]
        uniform token subdivisionScheme = "none"
"""


def box(cx, cy, cz, h=0.05):
    corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
    return "point3f[] points = [" + ", ".join(f"({cx + x * h}, {cy + y * h}, {cz + z * h})" for x, y, z in corners) + "]"


PROBE = f"""#usda 1.0
(
    defaultPrim = "DataHall"
    metersPerUnit = 1
    upAxis = "Z"
)

def Xform "DataHall" (
    kind = "assembly"
)
{{
    double dchall:utilityMw = 2
    int dchall:gridColumns = 16
    int dchall:gridRows = 10
    double dchall:cellWidthM = 0.6
    double dchall:cellDepthM = 1.2

    def Scope "Catalog"
    {{
        class Xform "probe"
        {{
            string dchall:displayName = "Axis probe"
            token dchall:category = "fac"
            double dchall:heightM = 2

            def Mesh "marker_x"
            {{
{FACES}
                {box(1, 0, 0.5)}
            }}

            def Mesh "marker_front"
            {{
{FACES}
                {box(0, 0, 0)}
                double3 xformOp:translate = (0, -1, 0.5)
                uniform token[] xformOpOrder = ["xformOp:translate"]
            }}

            def Mesh "marker_up"
            {{
{FACES}
                {box(0, 0, 0)}
                double3 xformOp:translate = (0, 0, 2)
                float3 xformOp:scale = (1, 1, 3)
                uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
            }}
        }}
    }}

    def Scope "Equipment" (
        kind = "group"
    )
    {{
        def Xform "R01_C01" (
            kind = "component"
            instanceable = true
            prepend references = </DataHall/Catalog/probe>
        )
        {{
            int dchall:gridColumn = 0
            int dchall:gridRow = 0
        }}
    }}
}}
"""


def main():
    tmp = tempfile.mkdtemp()
    try:
        path = os.path.join(tmp, "probe.usda")
        with open(path, "w", encoding="utf-8") as f:
            f.write(PROBE)
        usd_to_unity.convert(path, os.path.join(tmp, "bundle"), "2026-09-17")
        os.makedirs(OUT, exist_ok=True)
        shutil.copy(os.path.join(tmp, "bundle", "assets", "probe.glb"), os.path.join(OUT, "axis_probe.glb"))
        print("wrote", os.path.join(OUT, "axis_probe.glb"))
    finally:
        shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
