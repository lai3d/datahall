#!/usr/bin/env python3
"""Validate an exported data hall USD file against the dchall codeless schemas.

Usage: pip install usd-core && python tools/validate_usd.py samples/datahall.usda

The schema plugin in schema/ is registered automatically. Checks fall into
three groups:
  - stage conventions: Z up, meters, defaultPrim /DataHall
  - schema conformance: every dchall: property is defined by an applied API
    schema, authored with the schema's type, and token values are allowed
  - data hall semantics: grid positions, value ranges, topology targets
"""
import os
import re
import sys

from pxr import Plug, Sdf, Usd, UsdGeom

SCHEMA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "schema")
HALL_API = "DataHallAPI"
EQUIPMENT_API = "DataHallEquipmentAPI"
LIQUID_API = "LiquidCooledAPI"
OUR_APIS = (HALL_API, EQUIPMENT_API, LIQUID_API)
NAMESPACE = "dchall:"

# 必须显式写出的属性：schema 默认值对它们没有意义
REQUIRED = {
    HALL_API: ("dchall:utilityMw", "dchall:gridColumns", "dchall:gridRows",
               "dchall:cellWidthM", "dchall:cellDepthM"),
    EQUIPMENT_API: ("dchall:category", "dchall:heightM", "dchall:gridColumn", "dchall:gridRow"),
    LIQUID_API: ("dchall:liquidFraction",),
}
NON_NEGATIVE = ("dchall:powerKw", "dchall:gpuCount", "dchall:liquidCoolingKw", "dchall:airCoolingKw",
                "dchall:overheadKw", "dchall:distributionKw", "dchall:fabricPorts", "dchall:capexMusd")
# 拓扑关系 → 目标设备必须具备的能力
TOPOLOGY = {
    "dchall:powerFeed": "dchall:distributionKw",
    "dchall:coolantSource": "dchall:liquidCoolingKw",
}
PRIM_NAME = re.compile(r"^R(\d{2})_C(\d{2})$")


def register_schemas():
    Plug.Registry().RegisterPlugins(os.path.abspath(SCHEMA_DIR))
    reg = Usd.SchemaRegistry()
    missing = [n for n in OUR_APIS if not reg.FindAppliedAPIPrimDefinition(n)]
    if missing:
        raise RuntimeError(f"schema plugin in {SCHEMA_DIR} did not register {', '.join(missing)}")


def validate(path):
    """Return (errors, summary). summary is None when the hall itself is unusable."""
    register_schemas()
    stage = Usd.Stage.Open(path)
    errors = []
    if UsdGeom.GetStageUpAxis(stage) != UsdGeom.Tokens.z:
        errors.append("upAxis must be Z")
    if UsdGeom.GetStageMetersPerUnit(stage) != 1.0:
        errors.append("metersPerUnit must be 1")
    hall = stage.GetDefaultPrim()
    if not hall or hall.GetName() != "DataHall":
        errors.append("defaultPrim must be /DataHall")
        return errors, None
    if not hall.HasAPI(HALL_API):
        errors.append(f"{hall.GetPath()}: missing {HALL_API} (files exported before schema 0.2 need re-export)")
        return errors, None
    check_schema_conformance(hall, errors)

    equipment = stage.GetPrimAtPath("/DataHall/Equipment")
    kids = list(equipment.GetChildren()) if equipment else []
    grid = (hall.GetAttribute("dchall:gridColumns").Get(), hall.GetAttribute("dchall:gridRows").Get())
    occupied = {}
    for p in kids:
        if not p.IsInstance():
            errors.append(f"{p.GetPath()}: not instanceable")
        if not p.HasAPI(EQUIPMENT_API):
            errors.append(f"{p.GetPath()}: missing {EQUIPMENT_API}")
            continue
        check_schema_conformance(p, errors)
        check_equipment(p, grid, occupied, errors)

    placed = [p for p in kids if p.HasAPI(EQUIPMENT_API)]
    total = lambda n: sum(p.GetAttribute(n).Get() or 0 for p in placed)
    summary = {
        "equipment": len(kids),
        "it_load_kw": total("dchall:powerKw"),
        "gpus": total("dchall:gpuCount"),
        "bbox": UsdGeom.BBoxCache(Usd.TimeCode.Default(), ["default"]).ComputeWorldBound(hall).ComputeAlignedRange(),
    }
    return errors, summary


def check_schema_conformance(prim, errors):
    """Every authored dchall: property must be defined by an applied schema and match its definition."""
    where = prim.GetPath()
    defn = prim.GetPrimDefinition()
    for prop in prim.GetAuthoredProperties():
        name = prop.GetName()
        if not name.startswith(NAMESPACE):
            continue
        pdef = defn.GetPropertyDefinition(name)
        if not pdef:
            errors.append(f"{where}: {name} is not defined by any applied schema")
            continue
        # UsdAttribute.GetTypeName() 返回 schema 定义的类型，要看 spec 才能发现写错的类型
        for spec in prop.GetPropertyStack(Usd.TimeCode.Default()):
            if isinstance(spec, Sdf.AttributeSpec) != pdef.IsAttribute():
                errors.append(f"{where}: {name} authored as the wrong property kind ({spec.path})")
            elif pdef.IsAttribute():
                want = defn.GetAttributeDefinition(name).GetTypeName()
                if spec.typeName != want:
                    errors.append(f"{where}: {name} authored as {spec.typeName}, schema says {want} ({spec.path})")
            if spec.custom:
                errors.append(f"{where}: {name} is a schema property and must not be authored custom ({spec.path})")
    for api, names in REQUIRED.items():
        if prim.HasAPI(api):
            for name in names:
                if not prim.GetAttribute(name).HasAuthoredValue():
                    errors.append(f"{where}: {api} requires an authored {name}")
    for name in defn.GetPropertyNames():
        attr_def = defn.GetAttributeDefinition(name)
        allowed = attr_def.GetMetadata("allowedTokens") if attr_def else None
        if allowed:
            value = prim.GetAttribute(name).Get()
            if value not in allowed:
                errors.append(f"{where}: {name} = {value!r} is not one of {list(allowed)}")


def check_equipment(p, grid, occupied, errors):
    where = p.GetPath()
    val = lambda n: p.GetAttribute(n).Get()
    col, row = val("dchall:gridColumn"), val("dchall:gridRow")
    cols, rows = grid
    if not (0 <= col < cols and 0 <= row < rows):
        errors.append(f"{where}: grid column {col}, row {row} is outside {cols} x {rows}")
    if (col, row) in occupied:
        errors.append(f"{where}: grid column {col}, row {row} is already used by {occupied[(col, row)]}")
    occupied[(col, row)] = where
    m = PRIM_NAME.match(p.GetName())
    if not m or (int(m.group(1)) - 1, int(m.group(2)) - 1) != (row, col):
        errors.append(f"{where}: name must be R{row + 1:02d}_C{col + 1:02d} for its grid position")

    for name in NON_NEGATIVE:
        if val(name) < 0:
            errors.append(f"{where}: {name} must be >= 0, got {val(name)}")
    if val("dchall:heightM") <= 0:
        errors.append(f"{where}: dchall:heightM must be > 0")
    if p.HasAPI(LIQUID_API):
        frac = val("dchall:liquidFraction")
        if not 0 < frac <= 1:
            errors.append(f"{where}: dchall:liquidFraction must be in (0, 1], got {frac}")

    stage = p.GetStage()
    for rel_name, capability in TOPOLOGY.items():
        rel = p.GetRelationship(rel_name)
        targets = rel.GetTargets() if rel else []
        if len(targets) > 1:
            errors.append(f"{where}: {rel_name} has {len(targets)} targets, at most one allowed")
        for t in targets:
            target = stage.GetPrimAtPath(t)
            if not target:
                errors.append(f"{where}: {rel_name} -> missing {t}")
            elif not target.HasAPI(EQUIPMENT_API) or target.GetAttribute(capability).Get() <= 0:
                errors.append(f"{where}: {rel_name} -> {t}, which has no {capability}")


def main(path):
    errors, summary = validate(path)
    if summary:
        print("equipment={equipment} it_load_kw={it_load_kw:.0f} gpus={gpus} bbox={bbox}".format(**summary))
    for e in errors:
        print("ERROR", e)
    print("OK" if not errors else f"{len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "samples/datahall.usda"))
