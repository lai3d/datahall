# Unity version: USD integration options

Research date 2026-09-17. This compares how the Unity version could consume this project's OpenUSD data: hall layout, equipment parameters, topology, and the high-fidelity SimReady assets swapped in later. This document only compares options and gives a recommendation; it contains no implementation.

**Target platform: macOS desktop app (Apple Silicon).** Decided on 2026-09-17.

**Decision (2026-09-17):** Option A. Unity 6000.6.1f1 (already installed locally), URP, project lives in this repo under `unity/`.

**Implementation status (2026-09-17):** A1–A4 are done.
- **A1:** `spec/layout.schema.json`, the web "Export for Unity" action.
- **A2:** `tools/usd_to_unity.py`.
- **A3:** `unity/`; the built macOS app passes the smoke assertions, and rendering and the Chinese UI were checked against screenshots.
- **A4:** C# capacity model, matching `spec/capacity-cases.json` case by case.

A5 (real SimReady assets) is not done yet. A1–A4 actually took about half a Claude session hour, well under the 4–6 hours estimated below: the export format has a small scope, and the local Unity toolchain was already in place.

There is no mainstream VR runtime on macOS (SteamVR dropped macOS support in 2020), so VR is out of scope for now. If a Quest standalone headset is targeted later, see the appendix at the end; the recommendation stays the same, with even stronger reasons.

## Conclusion

**Recommended: option A. Convert equipment geometry offline to glb and ship it with the app; pass the hall layout to Unity as `layout.json`.**

**Division of responsibilities:**
- **`layout.json`** (layout, parameters, topology): exported directly by the web version, and also generated from any `.usda` by the Python pxr converter. The Unity runtime reads the JSON and places equipment.
- **`assets/<catalogId>.glb`** (geometry, PBR materials): generated offline by the pxr converter and imported as prefabs by glTFast in the editor. Tray disassembly and fault-drill interactions are built on the prefabs.

**Reasons:**
1. **The most common workflow is the shortest.** The user lays out a hall on the web, exports it, and opens it in the Unity app. No Python and no native plugin are needed anywhere in that flow. Equipment geometry rarely changes, so it can ship with the app.
2. **Composition is left to the reference implementation.** SimReady asset replacement relies on writing `over` in a stronger layer (see `docs/simready-audit.md`), which needs real USD composition. The converter does composition with OpenUSD 26.8, so there is no need to reimplement it in Unity.
3. **Testable.** Both the converter and the `layout.json` format can be tested without Unity installed, alongside the existing vitest and pytest suites.
4. **Unity-side dependencies are actively maintained.** glTFast still had releases in 2026-08 and imports in both the editor and at runtime.

**Main alternative: B3 (Unity USD Core C# bindings, reading USD directly at runtime).** Tested locally: the built macOS app can read this project's usda as well as usdc written by USD 26.08, and instanceable composition, prototype parameter inheritance and relationships are all correct.

**Problems with B3:**
- It needs a post-build step, otherwise the app crashes as soon as it opens USD;
- The dependency is stuck at USD v23.02 and Unity has not updated it since 2023-12; the Importer from the same set of USD packages already fails to compile on Unity 6000.6.

**How to choose:** If "the Unity app opens `.usda` directly and uses USD as the only format end to end" matters to you, choose B3; otherwise choose A, which has lower long-term maintenance risk.

**Option C (Unity USD Importer) failed to compile in testing and is ruled out.** Option B1 (building OpenUSD ourselves) is only worth considering if neither A nor B3 meets the requirements.

## Current landscape

| Item | Status | Source |
|---|---|---|
| Unity USD Importer `com.unity.importer.usd` | 1.0.0-pre.2 (2024-09-17), **editor only**, materials limited to UsdPreviewSurface; **fails to compile on Unity 6000.6.1f1**: `IGraphValueUtility.cs(251,21): error CS0619`, `AssetDatabase.TryGetGUIDAndLocalFileIdentifier(int, …)` is obsolete and treated as an error | Package info, official manual, local testing |
| Unity USD Core `com.unity.usd.core` | 1.0.0-pre.1 (2023-12-12), **USD v23.02**; native libraries cover Windows x64, macOS arm64/x64, Linux x64; **the macOS arm64 library is also enabled in built players** (`Standalone: OSXUniversal`, `CPU: ARM64` in `PluginImporter`); no Android | Downloaded the package tarball and inspected `Runtime/Plugins` and `.meta` |
| Legacy `com.unity.formats.usd` | 3.0.0-exp.5 (2023-10); officially legacy support only, soon to be deprecated | Package info, Unity-Technologies/usd-unity-sdk |
| glTFast `com.unity.cloud.gltfast` | 6.20.0 (2026-08-27); imports in both editor and runtime; requires Unity 6000.0+; supports reading `extras`; `EXT_mesh_gpu_instancing` is import only | Package info, 6.20 features page |
| OpenUSD on macOS | Official build target, supports monolithic builds | OpenUSD BUILDING.md |
| `libusd_ms.dylib` in the usd-core 26.8 pip package | 81 MB, universal2; **cannot be linked against directly**: contains 727 Python symbols but does not link libpython, and ships no headers | Local `otool`, `nm` inspection |
| Local toolchain | Apple M5 Max, macOS 26.6.2, Xcode, cmake and ninja installed; Unity 6000.6.1f1 (arm64) and Unity CLI 1.0.0-beta.8 installed and signed in; batchmode creates a new project in 22 s and builds a macOS app in 13 s (110 MB) | Local check |
| LightUSD (formerly TinyUSDZ) | Dependency-free C++17 library with composition and instancing; 1.0 RC; C API and C# bindings still in `sandbox/`; Apache 2.0 | GitHub lighttransport/LightUSD (2026-09-15) |
| usd2gltf (PyPI) | 0.3.5, no updates since 2023-02 | PyPI |

### usd2gltf testing: not usable as is

Converting `samples/datahall.usda` with usd2gltf 0.3.5 plus usd-core 26.8:

- **Equipment instances lost:** the 17 equipment instances are exported as empty nodes with only a transform matrix and no children; the referenced prototype geometry is not carried over, so no equipment is visible in the hall.
- **Prototypes not attached to the scene:** the 7 `class` prototypes in Catalog and their 14 Body and Front prims are written as orphan nodes outside the scene graph, and Body and Front are not parented under the prototype nodes either.
- **Materials lost:** only 1 material (the floor) is exported; the 14 materials in the prototypes' internal `Looks` are all dropped.
- **Axes not converted:** USD is Z-up and glTF is Y-up, and the converter does not handle this.
- **Custom attributes lost:** none of the `dchall:` attributes end up in `extras`.

So option A requires writing our own converter. Fortunately the export format is defined by this project, so the scope to handle is small.

## Options

### A. Offline conversion: `layout.json` + one glb per equipment type

```
Web version ──export──▶ layout.json ◀──tools/usd_to_unity.py (pxr)── any datahall.usda (may include SimReady over layers)
                     │                        │
                     │                        └──▶ assets/<catalogId>.glb (geometry + PBR materials)
                     ▼                                          ▼
       Unity runtime: read JSON, instantiate by grid position ◀── prefab ◀── glTFast editor import
```

**`layout.json`:**
- **Contents:** schema version, grid size, utility power, each device's catalog id and grid column/row, topology relationships (`powerFeed`, `coolantSource`), and the effective equipment parameters.
- **Format definition:** a JSON Schema shared by the web version and the converter.
- **Web version:** add a pure-function exporter in `web/src/` that reuses the existing topology computation.

**Converter (Python, composition via `Usd.Stage`):**
- **Geometry and materials:** for each Catalog prototype, flatten the composed geometry and write one glb; map UsdPreviewSurface to glTF pbrMetallicRoughness.
- **Coordinates:** convert USD Z-up to glTF Y-up, `(x, y, z)_usd → (x, z, -y)_gltf`. Equipment in this project faces -Y, which after conversion lands exactly on +Z, the glTF front-facing convention. glTFast handles the glTF-to-Unity handedness conversion.
- **Generating `layout.json` from `.usda`:** the result should match the web export field by field, verified against the existing sample.
- **Validation:** check glb files with the Khronos glTF-Validator.

**Unity side:**
- **Editor tool:** import glb and create or update prefabs. Interactions (trays, colliders, highlighting) live on prefab variants so they are not overwritten when geometry is reimported.
- **Runtime:** open `layout.json` and instantiate by grid position; port the capacity model to C# based on `web/src/sim.ts`, sharing one set of JSON test cases with the web version.

**Drawbacks:**
- Not live; changes to USD require reconversion.
- Converting MDL materials to glTF PBR is lossy.
- Writing edits made in Unity back to USD needs a `layout.json → usda` path (can reuse the web version's import and export logic).

### B1. macOS native plugin: OpenUSD 26.08

**Approach:**
- Build `libusd_m.dylib` locally with flags along the lines of `build_usd.py --build-monolithic --no-python --no-imaging`.
- Write a C API wrapper (open stage, traverse composed prims, read meshes, materials, attributes, relationships), call it from Unity via P/Invoke, and generate Mesh and Material in C#.

**Advantages:**
- The Unity app can open any `.usd`, `.usdc` or `.usdz` directly.
- USD version matches the SimReady toolchain.
- Possible to write USD back from the app later.

**Drawbacks:**
- **Native layer needs long-term maintenance:** rebuild on every USD upgrade; handle plugInfo resource paths inside the `.app` bundle; the plugin must be signed and notarized for distribution.
- **C# work is not reduced:** the mesh and material conversion code for Unity still has to be written, comparable to option A's Unity side, plus the native layer on top.
- **Performance needs separate testing:** large assets are parsed at runtime, so load times need their own performance testing.

### B3. Unity USD Core C# bindings (runtime)

**Approach:** use `com.unity.usd.core` (USD.NET) directly to open the stage at runtime, and write our own traversal and conversion code.

**Testing (2026-09-17, Unity 6000.6.1f1, Mono scripting backend):**

| Check | Editor | Built macOS app |
|---|---|---|
| Package compiles | ✅ | ✅ |
| Open `samples/datahall.usda` | ✅ | Not tested separately (same code path as usdc) |
| Open usdc written by USD 26.08 (crate 0.8.0) | ✅ | ✅ (requires the post-build step below) |
| instanceable instances, `dchall:powerKw = 190` composed from the class prototype | ✅ | ✅ |
| Targets of the `dchall:coolantSource` relationship | ✅ | ✅ |
| Traversal with instance proxies: 35 Meshes (1 floor, 2 for each of 17 devices) | ✅ | ✅ |
| `GetAppliedSchemas()` | Empty list (this project's schema plugin not registered; attribute values still readable) | — |

**Required post-build step:**
- **Crashes without it:** Unity's build copies only the dylibs, not `lib/usd/**/plugInfo.json`. Opening a stage reports `Failed to find plugin for ArDefaultResolver`, followed by a segfault in the native layer (exit code 139).
- **Fix:** copy the package's `Runtime/Plugins/arm64/MacOS/lib/usd` to `.app/Contents/PlugIns/ARM64/usd` (the `LibraryPath` in plugInfo is `../../libusd_*.dylib`, which lines up exactly), then re-sign (ad-hoc signing is enough locally). In the real project, automate this with `IPostprocessBuildWithReport`.

**Advantages:**
- No converter and no new interchange format; Unity reads the web-exported `.usda` directly.
- Composition happens at runtime, so SimReady override layers could take effect directly (depends on whether 23.02 can read those assets).
- No need to build USD ourselves.

**Drawbacks:**
- **Stagnant dependency:** USD v23.02, in pre-release since 2023-12; the Importer from the same package set already fails to compile on Unity 6000.6, and USD Core may hit the same problem later.
- **Unknown compatibility with newer assets:** this project's own files work, but SimReady assets produced by the 2026 toolchain may not be read fully if they use schemas or crate versions newer than 23.02; needs validation with real assets.
- **C# work is not reduced:** the mesh and material conversion code for Unity has to be written in C#, comparable to option A's converter, just in a different language.
- **Not yet verified:** the IL2CPP scripting backend, and distribution after signing and notarization.

### C. Unity's official USD Importer (editor import)

**Ruled out.**
- **Does not compile:** on local Unity 6000.6.1f1, `com.unity.importer.usd@1.0.0-pre.2` fails to compile (CS0619, calls the obsolete `AssetDatabase.TryGetGUIDAndLocalFileIdentifier(int, …)`), which breaks compilation of all editor scripts in the project.
- **Other limitations:** even on earlier Unity versions where it works, it is editor only and built on USD v23.02; the official docs do not mention instancing, payloads, variants or custom attributes.

## Comparison (macOS)

| | A Offline: JSON + glb | B1 OpenUSD native plugin | B3 Unity USD Core runtime | C Unity USD Importer |
|---|---|---|---|---|
| Local testing | Converter not written; usd2gltf unusable | Not tested | ✅ Built macOS app can read (needs post-build step) | ❌ Fails to compile on Unity 6000.6 |
| Unity app opens `.usda` directly | ❌ Reads `layout.json` (web export) | ✅ | ✅ | — |
| Composition correctness | ✅ pxr 26.8 | ✅ OpenUSD 26.08 | ✅ Verified on this project's files; SimReady assets unverified (23.02) | — |
| `dchall:` parameters and topology | ✅ layout.json | ✅ Read attributes | ✅ Verified | — |
| Dependency risk | Low: usd-core and glTFast actively maintained | Medium: self-built, signing, upgrades | High: stagnant dependency; Importer from the same set already broken on new Unity | — |
| CI testing (Unity installed, batchmode available) | Converter needs no Unity; EditMode on Unity side | Partial | EditMode plus build smoke test | — |
| First usable version (Claude session hours) | 4–6 | 9–13 | 4–6 | — |

## Effort estimate (option A)

In Claude session hours; actual calendar time depends on how sessions are scheduled.

| Step | Session hours | Scope |
|---|---|---|
| A1 `layout.json` format | 1 | JSON Schema; web export button and pure-function exporter; vitest cases |
| A2 Converter | 2–3 | `tools/usd_to_unity.py`: prototypes to glb, `.usda` to `layout.json`, coordinate conversion; pytest plus glTF-Validator; regression tests on the sample and the SimReady replacement pattern |
| A3 Unity project | 2–3 | Editor import of glb into prefabs, runtime opening of `layout.json` and instantiation; EditMode tests |
| A4 Capacity model port | 1–2 | Port `sim.ts` to C#, sharing JSON test cases with the web version |
| A5 High-fidelity assets | 3–5 (depends on assets) | Real SimReady assets: payloads, large meshes, MDL-to-PBR approximation, textures |

**Steps you need to do yourself (duration outside Claude's control):**
- ~~Install Unity and sign in~~: done (6000.6.1f1). Claude can run tests, build and run the macOS app via batchmode. 6000.6 is not LTS; if you want long-term stability, install 6000.3 LTS in Hub, which you need to do yourself.
- If the `.app` is to be sent to others: an Apple Developer account, plus signing and notarization. Not needed for running locally only.
- Obtaining and licensing real SimReady assets.

## Still to decide

1. **A or B3:** must the Unity app open `.usda` directly (USD as the only format end to end)?
   - Not required: choose A, low dependency risk.
   - Required: choose B3, proven workable in testing but with a stagnant dependency; if it breaks in a future Unity version, the fallback is B1.
2. **Unity version and render pipeline:** keep the installed 6000.6 or switch to 6000.3 LTS; URP is the recommended render pipeline (stable performance on Apple Silicon, full glTFast shader support), HDRP if visual quality is the priority.
3. **Where the Unity project lives:** recommended in this repo under `unity/`, version-controlled together with the converter and JSON Schema.

## Appendix: if a Quest standalone headset is targeted later

- **Unity USD Core:** no Android native libraries.
- **OpenUSD:** official build targets do not include Android (BUILDING.md lists Windows, macOS, visionOS, WebAssembly); the community aarch64 build script syoyo/USD-build-aarch64 was last committed to in 2022-10.
- **LightUSD:** has Android CI, but the C API is still experimental.
- **Conclusion:** reading USD at runtime on Quest is high risk. Option A reads only JSON and glb on the device, so it is unaffected, and glTFast supports runtime import.

## Sources

- [Unity USD Importer manual](https://docs.unity3d.com/Packages/com.unity.importer.usd@1.0/manual/index.html), [USD Core manual](https://docs.unity3d.com/Packages/com.unity.usd.core@1.0/manual/index.html), [Understanding the Unity USD Packages](https://docs.unity3d.com/Packages/com.unity.exporter.usd@1.0/manual/UnderstandingUsdPackages.html)
- Package info: `https://packages.unity.com/com.unity.importer.usd`, `com.unity.usd.core`, `com.unity.formats.usd`, `com.unity.cloud.gltfast` (queried 2026-09-17), and the `com.unity.usd.core` 1.0.0-pre.1 package files
- [glTFast 6.20 feature list](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.20/manual/features.html)
- [OpenUSD BUILDING.md](https://github.com/PixarAnimationStudios/OpenUSD/blob/dev/BUILDING.md), [syoyo/USD-build-aarch64](https://github.com/syoyo/USD-build-aarch64)
- [lighttransport/LightUSD](https://github.com/lighttransport/LightUSD)
- [usd2gltf](https://pypi.org/project/usd2gltf), [Unity-Technologies/usd-unity-sdk](https://github.com/Unity-Technologies/usd-unity-sdk)
- [Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator)
