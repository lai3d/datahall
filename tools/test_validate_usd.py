#!/usr/bin/env python3
"""Tests for validate_usd.py: the sample passes, and each rule catches a targeted mutation of it.

Usage: python -m unittest discover -s tools
"""
import os
import tempfile
import unittest

import validate_usd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAMPLE = os.path.join(ROOT, "samples", "datahall.usda")

VR200 = 'class Xform "vr200" (\n            prepend apiSchemas = ["DataHallEquipmentAPI", "LiquidCooledAPI"]\n        )\n        {\n'
R04_C05 = "            int dchall:gridColumn = 4\n            int dchall:gridRow = 3\n"


class ValidateUsdTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(SAMPLE, encoding="utf-8") as f:
            cls.sample = f.read()
        cls.tmp = tempfile.TemporaryDirectory()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_mutated(self, old, new):
        self.assertEqual(self.sample.count(old), 1, f"mutation anchor must be unique: {old!r}")
        path = os.path.join(self.tmp.name, f"{self._testMethodName}.usda")
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.sample.replace(old, new))
        return validate_usd.validate(path)[0]

    def assertError(self, errors, fragment):
        self.assertTrue(any(fragment in e for e in errors), f"expected an error containing {fragment!r}, got {errors}")

    def test_sample_is_valid(self):
        errors, summary = validate_usd.validate(SAMPLE)
        self.assertEqual(errors, [])
        self.assertEqual((summary["equipment"], summary["it_load_kw"], summary["gpus"]), (17, 2542, 864))

    def test_missing_hall_api(self):
        errors = self.run_mutated('    prepend apiSchemas = ["DataHallAPI"]\n', "")
        self.assertError(errors, "/DataHall: missing DataHallAPI")

    def test_property_outside_schema(self):
        errors = self.run_mutated(VR200, VR200 + "            double dchall:bogusKw = 1\n")
        self.assertError(errors, "dchall:bogusKw is not defined by any applied schema")

    def test_wrong_type(self):
        errors = self.run_mutated("int dchall:gpuCount = 72\n            double dchall:liquidFraction = 1.0",
                                  "double dchall:gpuCount = 72\n            double dchall:liquidFraction = 1.0")
        self.assertError(errors, "dchall:gpuCount authored as double, schema says int")

    def test_custom_schema_property(self):
        errors = self.run_mutated("double dchall:powerKw = 190.0", "custom double dchall:powerKw = 190.0")
        self.assertError(errors, "dchall:powerKw is a schema property and must not be authored custom")

    def test_disallowed_token(self):
        errors = self.run_mutated('"Vera Rubin NVL72"\n            token dchall:category = "gpu"',
                                  '"Vera Rubin NVL72"\n            token dchall:category = "compute"')
        self.assertError(errors, "dchall:category = 'compute' is not one of")

    def test_liquid_property_without_liquid_api(self):
        errors = self.run_mutated(VR200, VR200.replace(', "LiquidCooledAPI"', ""))
        self.assertError(errors, "dchall:liquidFraction is not defined by any applied schema")
        self.assertError(errors, "dchall:coolantSource is not defined by any applied schema")

    def test_missing_required(self):
        errors = self.run_mutated("            double dchall:heightM = 2.6\n", "")
        self.assertError(errors, "DataHallEquipmentAPI requires an authored dchall:heightM")

    def test_liquid_fraction_range(self):
        errors = self.run_mutated("int dchall:gpuCount = 72\n            double dchall:liquidFraction = 1.0",
                                  "int dchall:gpuCount = 72\n            double dchall:liquidFraction = 1.5")
        self.assertError(errors, "dchall:liquidFraction must be in (0, 1], got 1.5")

    def test_grid_collision_and_name(self):
        errors = self.run_mutated(R04_C05, R04_C05.replace("gridColumn = 4", "gridColumn = 3"))
        self.assertError(errors, "grid column 3, row 3 is already used by /DataHall/Equipment/R04_C04")
        self.assertError(errors, "R04_C05: name must be R04_C04")

    def test_grid_out_of_range(self):
        errors = self.run_mutated(R04_C05, R04_C05.replace("gridColumn = 4", "gridColumn = 40"))
        self.assertError(errors, "grid column 40, row 3 is outside 16 x 10")

    def test_topology_target_capability(self):
        errors = self.run_mutated(R04_C05 + "            rel dchall:coolantSource = </DataHall/Equipment/R06_C05>\n"
                                  "            rel dchall:powerFeed = </DataHall/Equipment/R06_C07>",
                                  R04_C05 + "            rel dchall:coolantSource = </DataHall/Equipment/R06_C05>\n"
                                  "            rel dchall:powerFeed = </DataHall/Equipment/R06_C05>")
        self.assertError(errors, "R04_C05: dchall:powerFeed -> /DataHall/Equipment/R06_C05, which has no dchall:distributionKw")

    def test_topology_missing_target_and_multiple_targets(self):
        errors = self.run_mutated(R04_C05 + "            rel dchall:coolantSource = </DataHall/Equipment/R06_C05>",
                                  R04_C05 + "            rel dchall:coolantSource = [</DataHall/Equipment/R06_C05>, </DataHall/Equipment/R99_C99>]")
        self.assertError(errors, "dchall:coolantSource has 2 targets, at most one allowed")
        self.assertError(errors, "dchall:coolantSource -> missing /DataHall/Equipment/R99_C99")


if __name__ == "__main__":
    unittest.main()
