#!/usr/bin/env python3
"""Tests for dsx_overlay.py, with stand-in assets built like AI Factory equipment (no NVIDIA files needed).

Usage: python -m unittest discover -s tools
"""
import io
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

from pxr import Usd

import dsx_overlay
from test_usd_to_unity import RACK_ASSET, SAMPLE, write

# The same rack modeled in centimeters and Y up, as some DCC exports are
RACK_CM_Y_UP = """#usda 1.0
(
    defaultPrim = "rack"
    metersPerUnit = 0.01
    upAxis = "Y"
)
def Xform "rack" (kind = "component")
{
    def Mesh "chassis"
    {
        float3[] extent = [(-60, 0, -30), (60, 230, 30)]
        int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
        int[] faceVertexIndices = [0, 3, 2, 1, 4, 5, 6, 7, 0, 1, 5, 4, 2, 3, 7, 6, 1, 2, 6, 5, 3, 0, 4, 7]
        point3f[] points = [(-60, 0, 30), (60, 0, 30), (60, 0, -30), (-60, 0, -30), (-60, 230, 30), (60, 230, 30), (60, 230, -30), (-60, 230, -30)]
    }
}
"""


class DsxOverlayTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.hall = os.path.join(self.tmp, "hall", "datahall.usda")
        os.makedirs(os.path.dirname(self.hall))
        shutil.copy(SAMPLE, self.hall)
        self.assets = os.path.join(self.tmp, "vendor")
        os.makedirs(self.assets)
        self.rack = os.path.join(self.assets, "rack.usda")
        write(self.rack, RACK_ASSET)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = dsx_overlay.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_swaps_the_prototype_and_every_instance_follows(self):
        out = os.path.join(self.tmp, "hall", "datahall_dsx.usda")
        code, text, _ = self.run_main(self.hall, "--asset", f"vr200={self.rack}")
        self.assertEqual(code, 0)
        # 1.21 deep: the stand-in carries a front marker 1 cm proud of its chassis
        self.assertIn("vr200: 0.60 m wide (X) × 1.21 m deep (Y) × 2.30 m high", text)
        self.assertNotIn("warning", text)
        # Paths stay relative, so the overlay and the hall can move together
        layer = open(out, encoding="utf-8").read()
        self.assertIn("@./datahall.usda@", layer)
        self.assertIn("@../vendor/rack.usda@", layer)
        stage = Usd.Stage.Open(out)
        proto = stage.GetPrimAtPath("/DataHall/Catalog/vr200")
        self.assertFalse(proto.GetChild("Body").IsActive())
        self.assertFalse(proto.GetChild("Front").IsActive())
        self.assertEqual(Usd.ModelAPI(proto.GetChild("simready_model")).GetKind(), "subcomponent")
        # Other types keep their simplified geometry
        self.assertTrue(stage.GetPrimAtPath("/DataHall/Catalog/cdu/Body").IsActive())

    def test_front_faces_the_hall_front(self):
        self.run_main(self.hall, "--asset", f"vr200={self.rack}")
        stage = Usd.Stage.Open(os.path.join(self.tmp, "hall", "datahall_dsx.usda"))
        from pxr import UsdGeom
        cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), [UsdGeom.Tokens.default_])
        proto = stage.GetPrimAtPath("/DataHall/Catalog/vr200")
        marker = proto.GetChild("simready_model").GetChild("front_marker")
        # The marker sits at +X in the asset; in the hall it must end up on the -Y side of the prototype
        mid = cache.ComputeLocalBound(marker).ComputeAlignedRange().GetMidpoint()
        xf = UsdGeom.Xformable(proto.GetChild("simready_model")).ComputeLocalToWorldTransform(Usd.TimeCode.Default())
        p = xf.Transform(mid)
        self.assertLess(p[1], -0.5)
        self.assertAlmostEqual(p[0], 0, places=3)

    def test_other_units_and_y_up_are_brought_to_meters_and_z_up(self):
        cm = os.path.join(self.assets, "rack_cm.usda")
        write(cm, RACK_CM_Y_UP)
        code, text, _ = self.run_main(self.hall, "--asset", f"cdu={cm}")
        self.assertEqual(code, 0)
        self.assertIn("cdu: 0.60 m wide (X) × 1.20 m deep (Y) × 2.30 m high", text)

    def test_warns_when_the_asset_faces_another_way(self):
        code, text, _ = self.run_main(self.hall, "--asset", f"vr200={self.rack}", "--rotate", "0")
        self.assertEqual(code, 0)
        self.assertIn("warning: wider than deep", text)

    def test_rejects_types_the_hall_does_not_use_and_bad_arguments(self):
        code, _, err = self.run_main(self.hall, "--asset", f"gb300={self.rack}")
        self.assertEqual(code, 1)
        self.assertIn("the hall has no gb300 devices", err)
        self.assertEqual(self.run_main(self.hall, "--asset", "vr200")[0], 1)
        self.assertEqual(self.run_main(self.hall, "--asset", "vr200=/no/such.usd")[0], 1)
        self.assertEqual(self.run_main(self.hall)[0], 1)


if __name__ == "__main__":
    unittest.main()
