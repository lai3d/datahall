# SimReady compliance audit

Audit date 2026-09-17, target `samples/datahall.usda` (schema 0.2, 17 devices). The sections from "Conclusion" through "Recommended fix order" record the state before the fixes; results after the fixes are in "Fix results" at the end.

## Conclusion

- **Units: compliant.** Z-up, metersPerUnit = 1, UN.001–UN.007 all pass. Equipment prototype origins are at the bottom center, consistent with SimReady VG.025 and the AIF asset guidelines.
- **kind: not required by the SimReady spec, but fails NVIDIA's general validator.** `/DataHall/Equipment` has no kind, so the 17 `component` instances fall outside the model hierarchy. Setting this Scope to `group` yields 0 issues.
- **Material binding: non-compliant.** The export writes only `displayColor` and no Material at all. With UsdPreviewSurface materials placed and bound inside each Catalog prototype, and the floor bound to `/DataHall/Looks`, VM.MAT.001 passes.
- **Against the closest official profile (Prop-Robotics-Neutral 2.1.0):** after the two changes above plus completing the metadata (see "Other failures"), three categories of failures remain.
  - Geometry uses `Cube` instead of `Mesh` (VG.MESH.001).
  - Directory structure required for single-asset packaging (NP.005).
  - Physics and grasping features (FET003–005), which do not apply to a hall layout file.
- **The CLAUDE.md approach of "writing `over` on Catalog prototypes to swap in high-fidelity models" breaks if used directly.** A rack modeled per the AIF convention faces +X, so referencing it in rotates it 90° wrong; a nested `component` also breaks the kind hierarchy. An extra child Xform with a rotation is needed, with kind lowered to `subcomponent`; see "Swapping in high-fidelity models" below.

All current SimReady profiles target single assets for robotics simulation (props, robot bodies); there is no profile for data center layouts or AI Factory. So "compliant" in this report means: each applicable requirement passes individually, plus 0 issues under the Omniverse Asset Validator (OAV) default rules, rather than passing a whole profile.

## References

| Source | Version | Purpose |
|---|---|---|
| [NVIDIA/simready-foundation](https://github.com/NVIDIA/simready-foundation) | `0ed0dfb` (2026-08-03, spec version 2026.06.0) | Requirement text, feature and profile definitions, validation rules |
| `simready-validate` / `usd-validation-nvidia` / `usd-profiles-nvidia` | 2026.6.5 / 1.22.0 / 1.22.0 | Official validator, including OAV default rules |
| `usd-core` | 26.8 | Same version used to validate the export sample |
| [NVIDIA-Omniverse/aif-pipeline-samples](https://github.com/NVIDIA-Omniverse/aif-pipeline-samples) | `4103896` (2026-03-13) | AI Factory equipment asset guidelines: units, orientation, kind, metadata, connection points |
| [Omniverse asset-requirements 1.1.6](https://docs.omniverse.nvidia.com/kit/docs/asset-requirements/1.1.6/capabilities/hierarchy/capability-hierarchy.html) | 1.1.6 | Older hierarchy spec cited by the AIF guidelines, used to confirm kind has no requirement |

## Reproduce

```bash
tools/simready_setup.sh                                          # fetch the pinned spec version, create a Python 3.12 venv in .simready/
.simready/venv/bin/python tools/simready_audit.py samples/datahall.usda
```

The script runs three passes:
1. Each requirement is wrapped in its own feature and run separately, so one failure does not block the others.
2. Prop-Robotics-Neutral 2.1.0 as is.
3. All 49 OAV rules registered by `usd-validation-nvidia`.

`tools/validate_usd.py` remains the project's own schema validation; the two do not replace each other.

## kind

**Spec text:** the hierarchy capability in both SimReady Foundation 2026.06.0 and asset-requirements 1.1.6 has no requirement about kind; kind appears only in example code (the root prim has `kind = "component"`).

**Two places do impose requirements on kind:**
- **OAV `KindChecker` (Basic category, not part of any SimReady profile):**
  - a model's kind must be registered;
  - the root of a model hierarchy can only be assembly, component or group;
  - all ancestors of a non-root model must be group-type kinds (group or assembly).
- **AIF asset guidelines:** require "Set Kind on the root prim", and the workflow checklist includes "Set kind metadata".

**Current state:**

| prim | kind | Result |
|---|---|---|
| `/DataHall` | assembly | Pass |
| `/DataHall/Floor`, `/DataHall/Catalog` | none | Not a model, not checked |
| `/DataHall/Catalog/<id>` | none | `class`, not reached by default traversal |
| `/DataHall/Equipment` | **none** | Breaks the model hierarchy |
| `/DataHall/Equipment/Rxx_Cyy` | component | **17 failures**: `Model prims can only be parented under ('assembly', 'group') prims` |

**Change:** `def Scope "Equipment" (kind = "group")`. Verified on a copy of the sample: 0 issues across the 49 OAV rules, and `tools/validate_usd.py` also passes.

## Units

| requirement | Content | Result |
|---|---|---|
| UN.001 / UN.006 | upAxis authored, and is Z | Pass |
| UN.002 / UN.007 | metersPerUnit authored, and is 1.0 | Pass |
| UN.003 | kilogramsPerUnit authored when physics is present | Pass (no physics, not applicable) |
| UN.004 | References with different units need a corrective transform | Pass (no external references) |
| UN.005 | timeCodesPerSecond authored when time samples are present | Pass (no time samples) |
| VG.025 / VG.026 | Origin and pivot at bottom center | Pass. The prototype's Body is translated to z = h/2, putting the origin on the floor |

**Units of `dchall:` attributes are outside SimReady's checks, but differ from the AIF metadata conventions:**
- AIF `aif:core:*` and `aif:spec:*` nominally use SI units; power in the spec sheets is in W or kW.
- Equipment dimensions (`aif:core:height`, `width`, `depth`) are in mm.
- Our `dchall:heightM` is in m, power in kW, price in millions of USD.

Interoperating with AIF metadata later would need an explicit conversion layer; the attribute names cannot simply be reused.

## Material binding

**Relevant requirements:**
- **VM.MAT.001:** every renderable GPrim must resolve to a bound material; the default material does not count.
- **VM.BIND.001:** binding targets must not leave the payload's scope.
- **VM.PS.001:** UsdPreviewSurface inputs must conform to the spec.
- **VM.BIND.002:** shader input types must be correct.

**Feature membership is not quite symmetric:**
- Prop-Robotics-Neutral uses `FET006_BASE_MDL`: VM.BIND.001/002, VM.MAT.001, VM.MDL.*, VM.TEX.*.
- `FET006_BASE_USDPREVIEW` contains only VM.BIND.001 and VM.PS.001, **not VM.MAT.001**.

**Current state:** none of the 35 GPrims has a material (1 floor, plus 17 devices × Body/Front), so VM.MAT.001 fails. VM.BIND.* and VM.PS.001 show as passing only because the file has no materials at all, which is a vacuous pass.

**Verified change:**

```usda
class Xform "vr200" ( prepend apiSchemas = ["DataHallEquipmentAPI", "LiquidCooledAPI"] )
{
    def Cube "Body" ( prepend apiSchemas = ["MaterialBindingAPI"] )
    {
        rel material:binding = </DataHall/Catalog/vr200/Looks/body>
    }
    def Scope "Looks"
    {
        def Material "body"
        {
            token outputs:surface.connect = </DataHall/Catalog/vr200/Looks/body/PreviewSurface.outputs:surface>
            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (0.0343, 0.0513, 0.0704)
                float inputs:roughness = 0.5
                token outputs:surface
            }
        }
    }
}
```

- **Materials live inside the prototype:** instances are instanceable, so the prototype's binding relationships are mapped through the reference to each instance's own `Looks`, satisfying the encapsulation requirement of VM.BIND.001.
- **Floor:** bound to `/DataHall/Looks/floor`.
- **`Looks` must be defined as a `Scope`:** an untyped `def "Looks"` triggers OAV's `TypeChecker`.
- **Result:** VM.MAT.001, VM.PS.001 and VM.BIND.001/002 all pass, and `FET006_BASE_MDL` passes as a whole.
- **The MDL issue:** under the current validator, UsdPreviewSurface also lets the MDL feature pass, but the Prop-Robotics-Neutral authoring guide explicitly requires MDL materials, and the AIF guidelines mention OmniPBR. For Omniverse RTX, materials should be replaced with MDL in a stronger layer, while the web export keeps UsdPreviewSurface for portability.

## Swapping in high-fidelity models

**AIF asset guideline conventions for equipment assets:**
- units in meters, +Z up;
- **front faces +X**;
- origin at the bottom mounting point;
- kind set on the root prim.

**This project's export uses a different orientation:** rack width 0.6 m along X, depth 1.2 m along Y, **front faces -Y** (Front panel at y = -0.576).

**Experiment:** build a rack asset modeled per the AIF convention (`kind = "component"`, depth 1.2 m along X, front marker at +X) and replace `vr200` in two ways:

| Approach | R04_C04 world bounding box X × Y | Front marker relative to origin | OAV |
|---|---|---|---|
| A: `over "vr200" (prepend references = @rack.usd@)` directly on the prototype | **1.22 × 0.60**, spans two cells | **(+0.61, 0)**, facing +X | 0 issues |
| B: new child Xform under the prototype that references the asset, with `rotateXYZ = (0, 0, -90)` and `kind = "subcomponent"` | 0.60 × 1.22 | (0, -0.61), facing -Y | 0 issues |
| C: same as B, but kind unchanged | 0.60 × 1.22 | (0, -0.61) | **10 KindChecker failures** (component nested under component) |

**Another problem with approach A:** the rotation cannot be authored on the asset's root prim. The instance authors its own `xformOpOrder = ["xformOp:translate"]`, which is a stronger opinion and completely overrides the transform on the referenced asset's root.

**Recommended approach B:**

```usda
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
                prepend references = @./vendor/gb300_rack/gb300_rack.usd@
                kind = "subcomponent"
            )
            {
                float3 xformOp:rotateXYZ = (0, 0, -90)
                uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
            }
        }
    }
}
```

usda requires each prim's `{` on its own line; multiple `over` levels cannot be compressed onto one line, or USD reports `Expected }`. `tools/test_usd_to_unity.py` uses this snippet as a regression test.

The snippet above is the form verified in the experiment (authoring only rotateXYZ gives the same result as approach B).

## Other failures

| requirement | Feature | Reason for failure | Recommendation |
|---|---|---|---|
| VG.MESH.001 | FET001 Minimal | Geometry uses `Cube`; a non-subdivided `Mesh` is required | Export an 8-vertex box Mesh with normals and extent. The change is in one place, `cube()` in `buildUsda` |
| NP.006 | FET000 Core | No `simready_metadata` in `customLayerData` | Add together with SR.001 |
| SR.001 | FET000 Core | **Validator falsely reports a pass.** The rule function puts errors into the returned list but never calls `_AddFailedCheck`, so it can never fail. Per the spec text, we are missing `asset_name`, `asset_type`, `source_file`, `usd_date_generated`, `SimReady_Metadata` | Add them in `customLayerData`. Verified that NP.006 passes once they are added |
| NP.005 | FET000 Core | Requires a `<asset>/<intermediate dir>/<file containing the asset name>.usd` directory structure | Aimed at single-asset packaging. Not achievable for a single file downloaded from the browser; handle when publishing an asset package |
| HI.002 | Not in any profile | The Cube's parent Xform has no rotate, the floor's parent `/DataHall` has no translate; also only one GPrim is allowed under an Xform | Optional. Wrap Body, Front and Floor each in an Xform with translate and rotateXYZ (unverified) |
| NP.001 | Not in any profile | The validator only accepts camelCase and snake_case; `DataHall`, `Body`, `Rxx_Cyy`, and even `Looks` and `PreviewSurface`, common in Omniverse, are flagged as failures | Won't change. Renaming would break defaultPrim and the published path conventions |
| SL.001 | FET011 semantic labels, not in the Prop profile family | Geometry has no `SemanticsLabelsAPI` or wikidata qcode | Optional. Add when doing synthetic data or perception training |
| FET003–FET005 | Prop-Robotics-Neutral | No rigid bodies, colliders or grasp vectors | Not applicable to a hall layout file |

## Incidental findings

The GB300 NVL72 metadata template in aif-pipeline-samples includes reference values:
- nameplate power 136 kW;
- MaxP AC (EDPP1) 142 kW, MaxP DC (TDP) 136 kW;
- liquid heat capture ratio 87% (liquid 116 kW, air 19.3 kW).

`spec/catalog.json` currently has `kw: 140`, `liq: 0.85`. The template is sample data in an NVIDIA repository, not an official spec sheet. If adopted, cite the source in the note per the data reliability rules in CLAUDE.md.

## Recommended fix order

1. Add `kind = "group"` to `Equipment` (one line, clears OAV).
2. `Looks` + UsdPreviewSurface inside prototypes, floor bound to `/DataHall/Looks/floor`; colors reuse the existing PALETTE.
3. Add the SR.001 fields and `SimReady_Metadata` to `customLayerData`.
4. Change `Cube` to `Mesh`.
5. Document approach B from "Swapping in high-fidelity models" in CLAUDE.md and the export README; do HI.002 as needed.

Steps 1–3 do not affect the `dchall:` schema, so `tools/validate_usd.py` needs no changes. Steps 4–5 change the geometry structure of the golden sample. After each step, run `npm run sample`, `tools/validate_usd.py` and `tools/simready_audit.py`.

## Fix results

On 2026-09-17, steps 1–5 were fixed in the order above, each in its own commit, with the sample regenerated and all checks rerun after every step. HI.002 was not addressed.

| Item | Before | After |
|---|---|---|
| Per-requirement checks | 31/38 pass | 39/43 pass (adds VG.008, VG.014, VG.027–029, which only check anything meaningful once there is a Mesh) |
| 49 OAV rules | 17 issues (KindChecker) | 0 issues |
| Prop-Robotics-Neutral 2.1.0: FET000 Core | Fail (NP.005, NP.006) | Fail (NP.005 only) |
| FET001 Minimal | Fail (VG.MESH.001) | **Pass** |
| FET006 Materials (MDL variant) | Fail (VM.MAT.001) | **Pass** |
| FET003–005 physics and grasping | Fail | Fail (not applicable) |

**Remaining failures, all expected not to be fixed per this report:**
- **HI.002:** not in any profile.
- **NP.001:** the naming rule flags even `Looks` and `PreviewSurface`.
- **NP.005:** single-asset packaging directory structure, not achievable for a single file exported from the browser.
- **SL.001:** semantic labels, to be done when needed.

**Implementation notes:**
- **Mesh:** all geometry shares one unit cube with 8 vertices and 6 quad faces, faceVarying normals, `subdivisionScheme = "none"`, still positioned via translate/scale; world bounding boxes match the Cube version.
- **Materials:** each prototype's `Looks` has two UsdPreviewSurface materials, `body` and `front`, with parameters matching the web three.js scene (rack roughness 0.55, metalness 0.35); `displayColor` is kept as a fallback color.
- **Metadata:** `buildUsda` gains a required parameter `meta.date`; the web export passes the current date, and `npm run sample` keeps the sample's original date.

**Added tests:**

The web tests check the following against the spec text, without depending on the `.simready` environment:
- the model hierarchy is continuous;
- every Mesh is bound to a material in the same prototype or in `/DataHall/Looks`;
- the SR.001 fields are complete;
- each cube face points outward and agrees with its normal.

**About mesh checks:** deliberately reversing the winding order of one face produced no errors from SimReady's VG.007/008/014/027–029; only OAV's `ManifoldChecker` reported 35 warnings. So winding order is safeguarded by the web tests.
