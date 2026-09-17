#!/usr/bin/env python3
"""Convert a data hall .usda into a bundle for the Unity app.

Usage: python tools/usd_to_unity.py samples/datahall.usda -o build/unity-bundle [--date YYYY-MM-DD]

Writes
  layout.json          spec/layout.schema.json; parameters are the composed USD values,
                       topology comes from the file's dchall:powerFeed / dchall:coolantSource
  assets/<id>.glb      one glTF 2.0 binary per equipment type in use

Geometry for each type is taken from its first placed instance, composed and traversed
through instance proxies, so stronger-layer overs (for example a SimReady asset
referenced in place of the simplified geometry, docs/simready-audit.md) are honored.
USD is Z-up and glTF is Y-up; points, normals and node matrices are rotated with
(x, y, z) -> (x, z, -y), which keeps winding and puts the hall's -Y front at glTF +Z.
Only UsdPreviewSurface is mapped to glTF PBR; other materials fall back to displayColor.
"""
import argparse
import datetime
import json
import os
import re
import struct
import sys

from pxr import Gf, Usd, UsdGeom, UsdShade

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate_usd  # noqa: E402  (registers the dchall schema plugin)

LAYOUT_FORMAT, LAYOUT_VERSION = "dchall.layout", 1
NAME = re.compile(r"^R\d{2}_C\d{2}$")
# layout.json catalog field -> (USD attribute, default)
CATALOG_FIELDS = [
    ("powerKw", "dchall:powerKw", 0.0), ("gpuCount", "dchall:gpuCount", 0), ("liquidFraction", "dchall:liquidFraction", 0.0),
    ("liquidCoolingKw", "dchall:liquidCoolingKw", 0.0), ("airCoolingKw", "dchall:airCoolingKw", 0.0),
    ("overheadKw", "dchall:overheadKw", 0.0), ("distributionKw", "dchall:distributionKw", 0.0),
    ("fabricPorts", "dchall:fabricPorts", 0), ("capexMusd", "dchall:capexMusd", 0.0),
    ("roadmap", "dchall:roadmap", False), ("heightM", "dchall:heightM", 0.0),
]

# USD Z-up -> glTF Y-up, column-vector form
C = [[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]]


class ConversionError(Exception):
    pass


def attr(prim, name, default=None):
    a = prim.GetAttribute(name)
    v = a.Get() if a and a.HasValue() else None
    return default if v is None else v


def number(v):
    """JSON number: ints stay ints, whole floats become ints so output matches the web exporter."""
    if isinstance(v, bool):
        return v
    f = float(v)
    return int(f) if f.is_integer() else round(f, 10)


def catalog_id(prim):
    listop = prim.GetMetadata("references")
    items = listop.ApplyOperations([]) if listop else []
    for ref in items:
        m = re.match(r"^/DataHall/Catalog/(\w+)$", str(ref.primPath))
        if not ref.assetPath and m:
            return m.group(1)
    return None


# ---------- layout ----------

def build_layout(stage, date, warn):
    hall = stage.GetDefaultPrim()
    if not hall or hall.GetName() != "DataHall":
        raise ConversionError("defaultPrim must be /DataHall")
    grid = {k: attr(hall, f"dchall:{k}") for k in ("gridColumns", "gridRows", "cellWidthM", "cellDepthM")}
    if None in grid.values():
        raise ConversionError("/DataHall is missing grid attributes")
    cols, rows = grid["gridColumns"], grid["gridRows"]

    equipment, first_instance, seen = [], {}, {}
    scope = stage.GetPrimAtPath("/DataHall/Equipment")
    for prim in (scope.GetChildren() if scope else []):
        name = prim.GetName()
        type_id = catalog_id(prim)
        if not type_id or not stage.GetPrimAtPath(f"/DataHall/Catalog/{type_id}"):
            warn(f"{name}: no /DataHall/Catalog reference, skipped")
            continue
        col, row = attr(prim, "dchall:gridColumn"), attr(prim, "dchall:gridRow")
        if not (isinstance(col, int) and isinstance(row, int) and 0 <= col < cols and 0 <= row < rows):
            warn(f"{name}: grid position missing or outside {cols} x {rows}, skipped")
            continue
        if (col, row) in seen:
            warn(f"{name}: cell already used by {seen[(col, row)]}, skipped")
            continue
        seen[(col, row)] = name
        first_instance.setdefault(type_id, prim)
        equipment.append((prim, type_id, col, row))

    placed = {p.GetName() for p, *_ in equipment}

    def target(prim, rel_name):
        rel = prim.GetRelationship(rel_name)
        targets = rel.GetTargets() if rel else []
        t = targets[0].name if targets else ""
        return t if t in placed and NAME.match(t) else ""

    catalog = []
    for type_id, prim in first_instance.items():
        entry = {"id": type_id, "name": attr(prim, "dchall:displayName", type_id), "category": attr(prim, "dchall:category", "")}
        for field, name, default in CATALOG_FIELDS:
            entry[field] = number(attr(prim, name, default))
        catalog.append(entry)

    layout = {
        "format": LAYOUT_FORMAT,
        "version": LAYOUT_VERSION,
        "generator": "GPU Data Hall Builder tools/usd_to_unity.py",
        "generated": date,
        "grid": {"columns": cols, "rows": rows, "cellWidthM": number(grid["cellWidthM"]), "cellDepthM": number(grid["cellDepthM"])},
        "utilityMw": number(attr(hall, "dchall:utilityMw", 2)),
        "catalog": catalog,
        "equipment": [
            {"name": p.GetName(), "type": t, "column": c, "row": r,
             "powerFeed": target(p, "dchall:powerFeed"), "coolantSource": target(p, "dchall:coolantSource")}
            for p, t, c, r in equipment
        ],
    }
    return layout, first_instance, {e["id"]: e for e in catalog}


# ---------- glTF ----------

def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def gltf_matrix(m):
    """Gf.Matrix4d (row-vector convention) -> glTF column-major list, rotated to Y-up."""
    a = [[m[j][i] for j in range(4)] for i in range(4)]            # column-vector form
    ct = [list(r) for r in zip(*C)]
    b = mat_mul(mat_mul(C, a), ct)
    return [b[r][c] for c in range(4) for r in range(4)]


def to_y_up(v):
    return (v[0], v[2], -v[1])


class GlbBuilder:
    def __init__(self, generator):
        self.gltf = {"asset": {"version": "2.0", "generator": generator}, "scene": 0, "scenes": [{"nodes": [0]}],
                     "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": [], "buffers": []}
        self.bin = bytearray()
        self.material_index = {}

    def view(self, data, target):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.gltf["bufferViews"].append({"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data), "target": target})
        self.bin.extend(data)
        return len(self.gltf["bufferViews"]) - 1

    def accessor(self, view, component, count, kind, **extra):
        self.gltf["accessors"].append({"bufferView": view, "componentType": component, "count": count, "type": kind, **extra})
        return len(self.gltf["accessors"]) - 1

    def material(self, key, name, base, metallic, roughness, emissive=(0, 0, 0)):
        if key in self.material_index:
            return self.material_index[key]
        opacity = base[3]
        mat = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": [round(c, 6) for c in base],
                                                      "metallicFactor": round(metallic, 6), "roughnessFactor": round(roughness, 6)}}
        if any(emissive):
            mat["emissiveFactor"] = [round(c, 6) for c in emissive]
        if opacity < 1:
            mat["alphaMode"] = "BLEND"
        self.gltf["materials"].append(mat)
        self.material_index[key] = len(self.gltf["materials"]) - 1
        return self.material_index[key]

    def mesh(self, name, positions, normals, indices, material):
        pos = b"".join(struct.pack("<3f", *p) for p in positions)
        nrm = b"".join(struct.pack("<3f", *n) for n in normals)
        idx = b"".join(struct.pack("<I", i) for i in indices)
        lo = [min(p[k] for p in positions) for k in range(3)]
        hi = [max(p[k] for p in positions) for k in range(3)]
        prim = {"attributes": {
                    "POSITION": self.accessor(self.view(pos, 34962), 5126, len(positions), "VEC3", min=lo, max=hi),
                    "NORMAL": self.accessor(self.view(nrm, 34962), 5126, len(normals), "VEC3")},
                "indices": self.accessor(self.view(idx, 34963), 5125, len(indices), "SCALAR"),
                "mode": 4}
        if material is not None:
            prim["material"] = material
        self.gltf["meshes"].append({"name": name, "primitives": [prim]})
        return len(self.gltf["meshes"]) - 1

    def node(self, **fields):
        self.gltf["nodes"].append(fields)
        return len(self.gltf["nodes"]) - 1

    def glb(self):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.gltf["buffers"] = [{"byteLength": len(self.bin)}]
        for key in ("meshes", "materials", "accessors", "bufferViews"):
            if not self.gltf[key]:
                del self.gltf[key]
        js = json.dumps(self.gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        js += b" " * (-len(js) % 4)
        body = struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(self.bin), b"BIN\0") + bytes(self.bin)
        return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


def shade(builder, gprim, warn):
    """glTF material index for a gprim's bound material, or its displayColor."""
    prim = gprim.GetPrim()
    mat, _ = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()
    if mat:
        shader = mat.ComputeSurfaceSource()[0]
        if shader and shader.GetIdAttr().Get() == "UsdPreviewSurface":
            def inp(name, default):
                i = shader.GetInput(name)
                if i and i.HasConnectedSource():
                    warn(f"{mat.GetPath()}: textured input {name} is not converted, using its fallback value")
                v = i.Get() if i else None
                return default if v is None else v
            color, opacity = inp("diffuseColor", Gf.Vec3f(0.18)), inp("opacity", 1.0)
            return builder.material(str(mat.GetPath()), mat.GetPrim().GetName(), (*color, opacity),
                                    inp("metallic", 0.0), inp("roughness", 0.5), tuple(inp("emissiveColor", Gf.Vec3f(0))))
        warn(f"{mat.GetPath()}: only UsdPreviewSurface is converted, falling back to displayColor")
    colors = gprim.GetDisplayColorAttr().Get()
    rgb = tuple(colors[0]) if colors else (0.5, 0.5, 0.5)
    return builder.material(("displayColor", rgb), "displayColor", (*rgb, 1.0), 0.0, 0.5)


def convert_mesh(builder, mesh, warn):
    points = mesh.GetPointsAttr().Get()
    counts = mesh.GetFaceVertexCountsAttr().Get()
    face_idx = mesh.GetFaceVertexIndicesAttr().Get()
    if not points or not counts or not face_idx:
        return None
    normals = mesh.GetNormalsAttr().Get()
    interp = mesh.GetNormalsInterpolation() if normals else None
    left = mesh.GetOrientationAttr().Get() == UsdGeom.Tokens.leftHanded
    if mesh.GetPrim().GetAttribute("subdivisionScheme").Get() not in (None, "none"):
        warn(f"{mesh.GetPath()}: subdivision surface is converted as its control mesh")
    if UsdGeom.Subset.GetGeomSubsets(mesh):
        warn(f"{mesh.GetPath()}: GeomSubset materials are not converted, using the mesh binding")

    positions, out_normals, indices, cache = [], [], [], {}
    fv = 0
    for face, n in enumerate(counts):
        corners = list(range(fv, fv + n))
        fv += n
        pts = [Gf.Vec3d(points[face_idx[c]]) for c in corners]
        flat = Gf.GetNormalized(Gf.Cross(pts[1] - pts[0], pts[2] - pts[0])) if n >= 3 else Gf.Vec3d(0, 0, 1)
        if left:
            flat = -flat
        verts = []
        for c in corners:
            if interp == UsdGeom.Tokens.faceVarying:
                nv = normals[c]
            elif interp in (UsdGeom.Tokens.vertex, UsdGeom.Tokens.varying):
                nv = normals[face_idx[c]]
            elif interp == UsdGeom.Tokens.uniform:
                nv = normals[face]
            else:
                nv = flat
            key = (face_idx[c], tuple(round(x, 6) for x in nv))
            if key not in cache:
                cache[key] = len(positions)
                positions.append(to_y_up(points[face_idx[c]]))
                out_normals.append(to_y_up(Gf.GetNormalized(Gf.Vec3d(nv))))
            verts.append(cache[key])
        for k in range(1, n - 1):                                   # fan triangulation
            tri = (verts[0], verts[k], verts[k + 1])
            indices.extend(tri if not left else (tri[0], tri[2], tri[1]))
    return builder.mesh(mesh.GetPrim().GetName(), positions, out_normals, indices, shade(builder, mesh, warn))


def build_glb(instance, entry, warn):
    builder = GlbBuilder("GPU Data Hall Builder tools/usd_to_unity.py")
    predicate = Usd.TraverseInstanceProxies(Usd.PrimDefaultPredicate)

    def visit(prim, is_root=False):
        if prim.IsA(UsdShade.Material) or prim.IsA(UsdShade.Shader) or prim.IsA(UsdShade.NodeGraph):
            return None
        img = UsdGeom.Imageable(prim)
        if img:
            if img.ComputeVisibility() == UsdGeom.Tokens.invisible:
                return None
            if img.ComputePurpose() in (UsdGeom.Tokens.guide, UsdGeom.Tokens.proxy):
                return None
        fields = {"name": entry["id"] if is_root else prim.GetName()}
        xf = UsdGeom.Xformable(prim)
        if xf and not is_root:
            m = xf.GetLocalTransformation()
            if m != Gf.Matrix4d(1):
                fields["matrix"] = [round(v, 9) for v in gltf_matrix(m)]
        if prim.IsA(UsdGeom.Mesh):
            mesh = convert_mesh(builder, UsdGeom.Mesh(prim), warn)
            if mesh is not None:
                fields["mesh"] = mesh
        elif prim.IsA(UsdGeom.Gprim):
            warn(f"{prim.GetPath()}: {prim.GetTypeName()} is not a Mesh and is skipped")
        if is_root:
            fields["extras"] = {"dchall": entry}
        index = builder.node(**fields)
        children = [c for c in (visit(ch) for ch in prim.GetFilteredChildren(predicate)) if c is not None]
        if children:
            builder.gltf["nodes"][index]["children"] = children
        elif "mesh" not in fields and not is_root and index == len(builder.gltf["nodes"]) - 1:
            builder.gltf["nodes"].pop()                              # 没有几何的空分组（例如材质 Scope）不输出
            return None
        return index

    visit(instance, is_root=True)
    return builder.glb()


def convert(path, out_dir, date, warn=lambda msg: print("warning:", msg, file=sys.stderr)):
    validate_usd.register_schemas()
    stage = Usd.Stage.Open(path)
    layout, instances, catalog = build_layout(stage, date, warn)
    os.makedirs(os.path.join(out_dir, "assets"), exist_ok=True)
    with open(os.path.join(out_dir, "layout.json"), "w", encoding="utf-8") as f:
        json.dump(layout, f, ensure_ascii=False, indent=2)
        f.write("\n")
    for type_id, prim in instances.items():
        with open(os.path.join(out_dir, "assets", f"{type_id}.glb"), "wb") as f:
            f.write(build_glb(prim, catalog[type_id], warn))
    return layout


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("usd")
    ap.add_argument("-o", "--out", required=True, help="output bundle directory")
    ap.add_argument("--date", default=datetime.date.today().isoformat(), help="generated date, YYYY-MM-DD")
    args = ap.parse_args()
    try:
        layout = convert(args.usd, args.out, args.date)
    except ConversionError as e:
        sys.exit(f"error: {e}")
    print(f"{args.out}: {len(layout['equipment'])} equipment, {len(layout['catalog'])} glb")


if __name__ == "__main__":
    main()
