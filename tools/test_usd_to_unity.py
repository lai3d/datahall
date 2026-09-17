#!/usr/bin/env python3
"""Tests for usd_to_unity.py.

Usage: python -m unittest discover -s tools
The web cross-check and glTF-Validator run only when web/node_modules is installed.
"""
import json
import os
import shutil
import struct
import subprocess
import tempfile
import unittest

import usd_to_unity

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAMPLE = os.path.join(ROOT, "samples", "datahall.usda")
WEB = os.path.join(ROOT, "web")
HAS_WEB = os.path.isdir(os.path.join(WEB, "node_modules")) and shutil.which("node")

# 按 AIF 约定建模的机柜：原点在底面中心，深 1.2 m 沿 +X，正面标记在 +X（docs/simready-audit.md 的实验资产）
RACK_ASSET = """#usda 1.0
(
    defaultPrim = "rack"
    metersPerUnit = 1
    upAxis = "Z"
)
def Xform "rack" (kind = "component")
{
    def Mesh "chassis"
    {
        float3[] extent = [(-0.6, -0.3, 0), (0.6, 0.3, 2.3)]
        int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
        int[] faceVertexIndices = [0, 3, 2, 1, 4, 5, 6, 7, 0, 1, 5, 4, 2, 3, 7, 6, 1, 2, 6, 5, 3, 0, 4, 7]
        point3f[] points = [(-0.6, -0.3, 0), (0.6, -0.3, 0), (0.6, 0.3, 0), (-0.6, 0.3, 0), (-0.6, -0.3, 2.3), (0.6, -0.3, 2.3), (0.6, 0.3, 2.3), (-0.6, 0.3, 2.3)]
    }
    def Mesh "front_marker"
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(0.61, -0.25, 0.2), (0.61, 0.25, 0.2), (0.61, 0.25, 2.1), (0.61, -0.25, 2.1)]
        rel material:binding = </rack/Looks/mdl> (bindMaterialAs = "strongerThanDescendants")
    }
    def Scope "Looks"
    {
        def Material "mdl"
        {
            token outputs:mdl:surface.connect = </rack/Looks/mdl/Shader.outputs:out>
            def Shader "Shader"
            {
                uniform token info:implementationSource = "sourceAsset"
                uniform asset info:mdl:sourceAsset = @OmniPBR.mdl@
                token outputs:out
            }
        }
    }
    def Mesh "connection_point"
    {
        uniform token purpose = "guide"
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(0, 0, 2.3), (0.1, 0, 2.3), (0.1, 0.1, 2.3), (0, 0.1, 2.3)]
    }
}
"""

SWAP_LAYER = """#usda 1.0
(
    defaultPrim = "DataHall"
    metersPerUnit = 1
    upAxis = "Z"
    subLayers = [@./datahall.usda@]
)
over "DataHall"
{
    over "Catalog"
    {
        over "vr200"
        {
            over "Body" (active = false)
            {
            }
            over "Front" (active = false)
            {
            }
            def Xform "simready_model" (
                prepend references = @./rack.usda@
                kind = "subcomponent"
            )
            {
                float3 xformOp:rotateXYZ = (0, 0, -90)
                uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
            }
        }
    }
}
"""


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack("<4sII", data[:12])
    assert (magic, version, length) == (b"glTF", 2, len(data))
    jlen = struct.unpack("<I", data[12:16])[0]
    return json.loads(data[20:20 + jlen])


def mat_mul(a, b):  # column-major 4x4 lists
    return [sum(a[r + k * 4] * b[k + c * 4] for k in range(4)) for c in range(4) for r in range(4)]


IDENTITY = [1.0 if r == c else 0.0 for c in range(4) for r in range(4)]


def world_bounds(gltf, names=None):
    """Axis-aligned bounds of mesh nodes (optionally only those whose name is in names), in glTF space."""
    lo, hi = [float("inf")] * 3, [float("-inf")] * 3

    def visit(i, parent):
        node = gltf["nodes"][i]
        m = mat_mul(parent, node.get("matrix", IDENTITY))
        if "mesh" in node and (names is None or node["name"] in names):
            acc = gltf["accessors"][gltf["meshes"][node["mesh"]]["primitives"][0]["attributes"]["POSITION"]]
            for x in (acc["min"][0], acc["max"][0]):
                for y in (acc["min"][1], acc["max"][1]):
                    for z in (acc["min"][2], acc["max"][2]):
                        p = [m[r] * x + m[r + 4] * y + m[r + 8] * z + m[r + 12] for r in range(3)]
                        for k in range(3):
                            lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
        for c in node.get("children", []):
            visit(c, m)

    visit(gltf["scenes"][0]["nodes"][0], IDENTITY)
    return lo, hi


def node_names(gltf):
    return [n["name"] for n in gltf["nodes"]]


class UsdToUnityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.warnings = []

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def convert(self, path):
        out = os.path.join(self.tmp, "bundle")
        layout = usd_to_unity.convert(path, out, "2026-09-17", warn=self.warnings.append)
        return layout, out

    def test_sample_layout(self):
        layout, out = self.convert(SAMPLE)
        self.assertEqual((len(layout["equipment"]), layout["utilityMw"]), (17, 5))
        self.assertEqual(sorted(os.listdir(os.path.join(out, "assets"))),
                         sorted(f"{c['id']}.glb" for c in layout["catalog"]))
        vr = next(c for c in layout["catalog"] if c["id"] == "vr200")
        self.assertEqual((vr["powerKw"], vr["liquidFraction"], vr["heightM"], vr["roadmap"]), (190, 0.95, 2.3, False))
        r = next(e for e in layout["equipment"] if e["name"] == "R04_C04")
        self.assertEqual((r["type"], r["column"], r["row"], r["coolantSource"], r["powerFeed"]), ("vr200", 3, 3, "R06_C04", "R06_C07"))
        self.assertEqual(self.warnings, [])

    @unittest.skipUnless(HAS_WEB, "web/node_modules not installed")
    def test_layout_matches_web_export(self):
        layout, _ = self.convert(SAMPLE)
        web = json.loads(subprocess.run(["node", "scripts/layout-from-usda.js", SAMPLE, "--date", "2026-09-17"],
                                        cwd=WEB, check=True, capture_output=True, text=True).stdout)
        layout.pop("generator"), web.pop("generator")
        self.assertEqual(layout, web)

    @unittest.skipUnless(HAS_WEB, "web/node_modules not installed")
    def test_gltf_validator(self):
        _, out = self.convert(SAMPLE)
        files = [os.path.join(out, "assets", f) for f in sorted(os.listdir(os.path.join(out, "assets")))]
        run = subprocess.run(["node", "scripts/validate-gltf.js", *files], cwd=WEB, capture_output=True, text=True)
        reports = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual([(r["errors"], r["warnings"]) for r in reports], [(0, 0)] * len(files))

    def test_prototype_geometry_is_y_up_with_front_at_plus_z(self):
        _, out = self.convert(SAMPLE)
        g = read_glb(os.path.join(out, "assets", "vr200.glb"))
        self.assertEqual(node_names(g), ["vr200", "Body", "Front"])
        self.assertEqual(g["nodes"][0]["extras"]["dchall"]["powerKw"], 190)
        lo, hi = world_bounds(g, {"Body"})
        for got, want in zip(lo + hi, [-0.276, 0.0, -0.564, 0.276, 2.3, 0.564]):     # 0.6×0.92 宽、2.3 高、1.2×0.94 深
            self.assertAlmostEqual(got, want, places=4)
        lo, hi = world_bounds(g, {"Front"})
        self.assertGreater((lo[2] + hi[2]) / 2, 0.5)                                  # 正面面板在 +Z
        mats = {m["name"]: m["pbrMetallicRoughness"] for m in g["materials"]}
        self.assertEqual(sorted(mats), ["body", "front"])
        self.assertAlmostEqual(mats["body"]["roughnessFactor"], 0.55, places=5)
        self.assertAlmostEqual(mats["front"]["baseColorFactor"][1], 0.7255, places=4)
        prim = g["meshes"][g["nodes"][1]["mesh"]]["primitives"][0]
        self.assertEqual((g["accessors"][prim["attributes"]["POSITION"]]["count"], g["accessors"][prim["indices"]]["count"]), (24, 36))

    def test_simready_swap_pattern(self):
        shutil.copy(SAMPLE, os.path.join(self.tmp, "datahall.usda"))
        write(os.path.join(self.tmp, "rack.usda"), RACK_ASSET)
        swap = os.path.join(self.tmp, "swap.usda")
        write(swap, SWAP_LAYER)
        _, out = self.convert(swap)
        g = read_glb(os.path.join(out, "assets", "vr200.glb"))
        names = node_names(g)
        self.assertNotIn("Body", names)                                              # 停用的简化几何
        self.assertNotIn("connection_point", names)                                  # guide purpose
        self.assertIn("chassis", names)
        lo, hi = world_bounds(g, {"chassis"})
        self.assertAlmostEqual(hi[0] - lo[0], 0.6, places=4)                          # 宽沿 X
        self.assertAlmostEqual(hi[2] - lo[2], 1.2, places=4)                          # 深沿 Z
        self.assertAlmostEqual(hi[1], 2.3, places=4)
        lo, hi = world_bounds(g, {"front_marker"})
        self.assertAlmostEqual((lo[2] + hi[2]) / 2, 0.61, places=4)                   # 正面在 +Z
        self.assertTrue(any("only UsdPreviewSurface" in w for w in self.warnings), self.warnings)
        self.assertEqual(next(m for m in g["materials"] if m["name"] == "displayColor")["pbrMetallicRoughness"]["baseColorFactor"], [0.5, 0.5, 0.5, 1.0])

    def test_skips_invalid_equipment_and_rejects_non_hall(self):
        with open(SAMPLE, encoding="utf-8") as f:
            text = f.read().replace("int dchall:gridColumn = 14", "int dchall:gridColumn = 40")
        path = os.path.join(self.tmp, "bad.usda")
        write(path, text)
        layout, _ = self.convert(path)
        self.assertEqual(len(layout["equipment"]), 16)
        self.assertTrue(any("R08_C15" in w and "outside" in w for w in self.warnings), self.warnings)
        other = os.path.join(self.tmp, "other.usda")
        write(other, '#usda 1.0\n(\n    defaultPrim = "World"\n)\ndef Xform "World"\n{\n}\n')
        with self.assertRaises(usd_to_unity.ConversionError):
            self.convert(other)


if __name__ == "__main__":
    unittest.main()
