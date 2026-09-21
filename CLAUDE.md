# GPU Data Hall Builder

A simulator for experiencing how an AI data center is built, focused on new-generation GPU racks (NVIDIA GB200/GB300 NVL72, Vera Rubin NVL72, Kyber; AMD Helios, MI355X; Huawei CloudMatrix 384).
Target form: a web version (for sharing, and the capacity-planning logic) + a Unity version (immersive experience, VR, tray teardown, failure drills).
The data format is OpenUSD-compatible, leaving room to adopt NVIDIA SimReady assets and the Omniverse DSX ecosystem later.

## Layout

- `web/`: web version, TypeScript (strict) + Vite + three.js 0.186 (version pinned in npm) + React 19 for the panel, entry `web/index.html` → `web/src/main.ts`
  - `tsconfig.json`: `npm run typecheck` (`tsc`, TypeScript 7) only type-checks and emits no files; bundling is done by Vite. `erasableSyntaxOnly` is on:
    no syntax that needs compiling, such as enums or parameter properties, so Node 24+ can run `scripts/*.ts` directly; relative imports all use the `.ts` extension
  - `src/types.ts`: shared data types (catalog, equipment, layout entries, feeds); `src/dom.ts`: `$` for getting page elements
  - UI architecture: `main.ts` owns the app logic and mutates `state` (`state.ts`), then calls `notify()` (`store.ts`); `ui.tsx` renders the right-hand panel and the overlay on the 3D view (HUD, undo / redo, reset view, via a portal into `#stage`) with React 19,
    re-rendering on every `notify()` through `useSyncExternalStore`. Components read `state` and the derived `hallModel()` (`model.ts`, also used by main.ts to sync alert caps and dimming in 3D) and call the `Actions` implemented in main.ts; they do not hold app state.
    The 3D scene (`scene.ts`, `controls.ts`) stays plain three.js. Panel-only state such as share / import messages and export progress lives in `state.ui`. Keep the DOM ids and `data-*` attributes stable: the e2e smoke tests depend on them
  - String types: the type of `zh.ts` is derived from `en.ts`; `tr(key, vars)` checks keys and variables at compile time
  - `vercel.json`: Vercel build settings (Vite, `npm ci`, `npm run build`, output `dist`) and a one-year `immutable` cache header for `/assets/*`, whose names carry a content hash
  - `src/catalog.ts`: imports `spec/catalog.json`, bundled at build time
  - `src/sim.ts`: capacity model and PUE, pure functions; `PUE_FACTORS` holds the teaching coefficients, shared by `energy.ts`, `growth.ts` and the methodology dialog
  - `src/i18n.ts` + `src/locales/en.ts`, `zh.ts`: UI language, English by default, switchable to Simplified Chinese (toggle at top right, remembered in localStorage, `?lang=zh` selects it directly).
    All UI copy, capacity issues and import messages go through `tr(key, vars)`; new strings must be added to both files, and `tests/i18n.test.ts` checks that keys match and no variables are missing
  - `src/supply.ts`: per-device capacity check; compares the load each CDU and RPP gets through nearest assignment via `supplyLinks` against its own capacity, pure functions. Web version only; Unity's `CapacityModel` has no counterpart
  - `src/usd-export.ts`: `buildUsda`, pure function, no dependency on the DOM or three, can be imported directly from node
  - `src/analytics.ts`: Vercel Web Analytics (`@vercel/analytics` `inject`), production builds only. `beforeSend` strips the hash and query; a visit that opened a `#layout=` share link is reported as the page `/shared` (the Hobby plan has no custom events). The script only tracks `pushState`/`popstate`, so the `replaceState` hash updates on every edit do not add page views
  - `src/download.ts`: uses downloads (zip) when `window.claude` exists, otherwise downloads the file directly via Blob; images (`saveBlob`) are saved as they are on both paths
  - "Save image" in the share section: `scene.ts`'s `snapshotPng` renders a frame and calls `toBlob` in the same task (no `preserveDrawingBuffer`), saved as `datahall-<date>.png`
  - `scene.ts`'s `snapshotDataUrl` is the same frame as a PNG data URL (`toDataURL`, also in the same task), used by the architecture report
  - `src/share-link.ts`: share links, layout encoded into the URL hash, pure functions
  - `src/layout-export.ts`: `buildLayout`, the `layout.json` for the Unity version, pure function; topology and equipment names are shared with the USD export through `grid.ts`'s `supplyLinks` and `equipmentName`
  - `src/report.ts`: `buildReport`, the architecture report as one self-contained HTML string, pure function, no DOM dependency. Everything but the screenshot and the share link is recomputed from the device list it is given, so the report never depends on the panel's view state
  - `src/usda-parser.ts`: a minimal parser for usda text (prims, attributes, metadata, values), no composition
  - `src/usd-import.ts`: imports `.usda` files exported by this app, pure function, returns the layout and a list of messages
  - `src/scene.ts` / `src/controls.ts`: three scene, picking, orbit camera and pointer input. `main.ts` imports both with `import()` at boot and assigns `view`, so first paint waits on the panel's code and not on three.js (about 400 kB of the 945 kB bundle).
    Everything that touches the scene runs in the async boot block at the bottom of `main.ts`, in the order it ran before; anything added there must keep that order
  - `src/edit.ts`: pure functions for editing (cells for row placement, layout comparison, undo history)
  - `src/tutorial.ts`: guided tutorial steps (pick GB200 → place 8 in a row → why it cannot power on → RPP → CDU → in-row cooler → IB → utility if needed → power on), pure. `main.ts` holds `state.tutorial` (step index) and advances it inside `refresh()` on every change, so any action that can complete a step must go through `refresh()`. Steps complete on hall conditions (shortages and per-device overloads from `blockingReasons`) and several can complete at once; the "why" step waits for Next. Facility steps also require the row of racks to still be there, since an empty hall is short of nothing; losing the row (undo, delete) is the one thing that sends the tutorial back, to the place step. The card is sticky at the top of the panel and outlines the current step's control (`.tut-target`). Loading a preset, import or share link ends the tutorial. First visits (no share link, nothing saved, not dismissed; `localStorage` `datahall.tutorial.seen`) get an offer; finishing reports the virtual page `/tutorial-done`
  - `src/growth.ts`: growth planning, cumulative per-phase capacity check (`growthPlan`) and how many more units fit (`headroom`), pure functions
  - `src/repair.ts`: repair suggestions for a hall that cannot power on (`planRepair`), pure functions. Options: add support units; if the feed is the limit, the smallest bigger feed from `sim.ts`'s `UTILITY_OPTIONS`, plus an alternative that keeps the feed and removes the fewest racks of the most common type from the end of the rows.
    Units are counted from the totals, then placed beside the devices they serve (CDUs and RPPs by packing their consumers in row then column order into groups one unit can carry), extra units are added where a CDU or RPP is still overloaded, and units that do not change the outcome are dropped.
  A device assigned to a unit by hand stays with it, so it is never a target for a new unit; an overload held in place that way sets `manualBlock` and the panel says to change the assignment instead.
  `applyRepair` places the units in the phase being viewed, since that is the phase the plan was made for.
    Every option is re-checked with `blockingReasons`, so `passes` includes per-device nearest assignment. `tests/repair.test.ts` applies the suggestions for every GPU rack type, several sizes and every feed
  - `src/scenarios.ts`: scenario library, short lessons on the same model (`SCENARIOS`: starting hall, completion condition, `scenarioResult` numbers for the conclusion), pure functions.
    Starting halls are built from the same code the app uses (`goal.ts`'s `generateLayout`, presets), so they cannot drift from the model; `tests/scenarios.test.ts` checks each start is not already finished and can be finished with the panel's own tools
  - `src/goal.ts`: layout from a goal (`generateLayout`: rack type, GPU count, utility feed, optional N+1), pure functions. Racks go in up to four centered rows (`rackCells`, at most 64 racks), `repair.ts`'s `addSupport` places the support units, and for N+1 one more unit of a facility's type is added next to its consumers while `singlePointsOfFailure` reports any.
    When the goal does not fit, the rack count steps down from the rack comparison's totals-only maximum until the layout passes, and `limit` says why: `utility`, `floor`, `layout` (per-device assignment) or `n1`. With 800 kW CDUs and RPPs, 600 kW Kyber racks cannot be N+1 beyond one rack, since no neighbour can take over a failed unit's load
  - `src/compare.ts`: rack comparison, the largest hall each GPU rack type can run on the current utility feed with the fewest support devices (`largestHall`, `supportFor`), pure functions.
    Totals only, like `headroom`: no per-device nearest assignment check, and the floor limit is the cell count, not a real placement. The panel section explains that GPU counts drop for newer racks because per-GPU performance is not modeled
  - `src/energy.ts`: annual energy and electricity cost, pure functions. Uses `sim.ts`'s facility formula split by what follows load: IT, cooling and distribution losses scale with the average load, equipment overhead runs all year, so the annual PUE rises at lower load.
    Inputs (price, average load) are view state in `state.energy`, kept in localStorage `datahall.energy` and cleaned by `cleanInputs`; they are not part of the layout, share links or analytics. `fmtEnergy` and `fmtMoney` format the figures for both the panel and the report
  - `src/ownership.ts`: simplified three- or five-year ownership estimate, pure functions. Hardware capex from `compute()`, electricity from `energy.ts`'s `annualEnergy` repeated per year (the formula is never duplicated), and an optional maintenance assumption as a share of hardware per year.
    `BANDS` sweeps the electricity price, the average load and the overhead share of the energy (what a different PUE would do) together to give the low and high cases, so the panel says "between X and Y". Inputs (years, maintenance) are view state in `state.ownership`, kept in localStorage `datahall.ownership` and cleaned by `cleanOwnership`; like the energy inputs they are not part of the layout, share links or analytics. The UI lives inside the annual energy section (`#ownership`), not a section of its own
  - `src/fabric.ts`: back-end (scale-out) fabric on Quantum-X800 InfiniBand, pure functions, informational: not part of `compute()`, the power-on check or `spec/capacity-cases.json`. `planFabric` is the fat-tree arithmetic (leaves share their rail's NICs evenly and take the uplinks the oversubscription ratio asks for; the spine count is the smallest divisor of a leaf's uplinks with enough ports, which reproduces NVIDIA's DGX SuperPOD GB300 and Vera Rubin tables, checked in `tests/fabric.test.ts`).
    `hallFabric` plans one fabric per GPU rack type with `fabric: "x800"` (each plane an independent copy), fills the IB racks' switch slots (`ports / radix`, two per rack) in row order, leaves first, measures every run from the grid (`RUN`, `IN_RACK_M`: estimates) and classifies it with the catalog's `cables`. Options (`state.fabric`: oversubscription, rail-optimized) are view state, not in the layout, share links, localStorage or analytics. `fabricText` builds the rows shared by the panel (`#fabric`, after the rack comparison) and the report (`#fabric` section, options passed in `ReportMeta.fabric`)
  - `src/rack-faces.ts`: procedural device fronts for the 3D view, drawn on canvases (color, bump and glow maps), one set per device type and theme, cached and shared (`clearFaces` on a theme change). Layouts are illustrative stacks of trays, power shelves, switch ports, drive bays or doors (`STACKS`), never vendor artwork; the glow map marks status lights and accent light bars, and the front material is the one the power-on animation drives. CDUs and RPPs leave the right third of the front (`METER_X`) as a recess for the load meter
  - `src/viz.ts`: pure helpers for the load visualization (meter segments and level, points along a link path, flow dot positions)
  - `src/scale.ts`: everyday scale references for the IT load in the HUD (DGX Sparks, US homes), rounded to two significant figures
  - `src/feeds.ts`: maintenance of manually assigned supply equipment (setting, cleaning up stale assignments, following supply equipment when it moves), pure functions
  - `src/redundancy.ts`: failure drills and N+1 check, pure functions; `blockingReasons` maps one-to-one to the UI's "cannot power on" conditions (guaranteed by tests)
  - `src/ui.tsx`: right-hand panel and 3D overlay (React); `src/store.ts`: change notification; `src/model.ts`: derived hall model; `src/state.ts`: shared state; `src/layout.ts`: presets and localStorage; `src/grid.ts`: grid constants
  - `e2e/` + `playwright.config.ts`: Playwright browser smoke tests (`npm run e2e`, CI job `e2e`). They run against `vite build --mode e2e` (test hook `window.__datahall` on, analytics off) and assert through DOM ids, `data-*` attributes and the `#layout=` hash, not app internals, so panel refactors must keep those ids and attributes. First run locally: `npx playwright install chromium`
  - `tests/`: vitest; `usd-export.test.ts` reverse-derives the equipment list from the sample and regenerates it, requiring a byte-for-byte match with `samples/datahall.usda`,
    and parses `schema/generatedSchema.usda` to check that every exported `dchall:` attribute is defined by an applied schema with a matching type (no pxr needed)
  - `scripts/update-sample.ts`: `npm run sample`, regenerates `samples/datahall.usda` from the sample's original layout after an intentional export format change
  - `src/examples.ts` + `scripts/examples-doc.ts`: the example gallery (`npm run examples` writes `docs/examples.md`, one share link per hall). Halls are built from the app's own presets, goal generator and repair planner, and each one declares what it shows (`claims`), checked by `tests/examples.test.ts` together with the generated document, so a catalog change cannot quietly break a story
  - `scripts/capacity-cases.ts`: `npm run capacity-cases`, generates `spec/capacity-cases.json` from `sim.ts` (Unity's C# capacity model is checked against it)
  - `scripts/catalog-freshness.ts`: `npm run catalog-check`, reports stale `checked` dates and aging sources in `spec/catalog.json`, pure `freshness(items, today)` plus printing (`tests/catalog-freshness.test.ts`)
  - `public/`: `favicon.svg` (hand-written), `og.png` and `apple-touch-icon.png` (generated by `scripts/social-images.ts`, `npm run social-images`: builds in e2e mode, captures the Vera Rubin preset powered on in the dark theme and composes the 1200 × 630 card; rerun after visible 3D changes and look at the result, since the crop assumes the default camera).
    `index.html`'s `og:image` is an absolute production URL, because crawlers do not resolve relative ones
  - `scripts/layout-from-usda.ts`, `scripts/validate-gltf.ts`: comparison and glTF-Validator checks for `tools/test_usd_to_unity.py`
  - `tests/fixtures/`: files for import tests. `pxr-resaved` and `pxr-edited` are generated by `tools/make_import_fixtures.py`;
    `schema-0.1` is the sample from commit `2cdd465`. Regenerate them after the export format changes, and update the expectations in `usd-import.test.ts`
- `spec/catalog.json`: equipment catalog, the **single source of truth**, with sources for every figure (format in `spec/catalog.schema.json`, see Data reliability). `name` and `note` are the Chinese source text, reused by the exported USD `displayName` and `layout.json`;
  English goes under each entry's `i18n.en` (missing fields fall back to the source text). When changing a note's figures or sources, change the Chinese and English together
- `spec/layout.schema.json`: `layout.json` format (`catalogVersion` and `modelVersion` are optional, so files written before they existed stay valid); `spec/capacity-cases.json`: shared test cases for the capacity model (generated file, do not edit by hand)
- `schema/`: codeless applied API schema plugin
  - `schema.usda`: source file, edit only this one
  - `generatedSchema.usda`, `plugInfo.json`: generated by `tools/gen_schema.sh`, committed together with the source file.
    `Root`/`ResourcePath`/`LibraryPath` in `plugInfo.json` are hand-edited relative paths, preserved on regeneration
- `samples/datahall.usda`: export sample, validated with OpenUSD 26.08 and the schema, also the golden file for export regression tests
- `tools/validate_usd.py`: schema-based USD validation, registers the `schema/` plugin automatically; `tools/test_validate_usd.py` is its test
- `tools/simready_setup.sh` + `tools/simready_audit.py`: checks against NVIDIA SimReady Foundation (pinned version) and the OAV default rules, environment in `.simready/`
- `docs/simready-audit.md`: SimReady audit report; `docs/unity-options.md`: Unity option comparison and decision; `docs/roadmap.md`: quarterly roadmap (Now / Next / Later / Shipped, ✅ per shipped item), Chinese version `docs/roadmap.zh.md`, edit both together; `docs/product-roadmap-proposal.md`: longer-term proposal the P0–P4 labels refer to
- `.gitattributes`: Git LFS rules, binary assets only (glb, usdc/usdz/usd, textures, audio/video, fonts, native libraries); `.usda`, `.gltf`, JSON and Unity YAML stay in regular git. `web/public/*.png` is excluded from LFS, because Vercel does not fetch LFS objects by default.
  `tools/check_lfs.sh` checks whether LFS files have been pulled, called automatically when Unity scripts start
- `tools/dsx_overlay.py`: local-only override layer that swaps NVIDIA DSX SimReady assets (GB300 rack, XDU2300 CDU) into an exported hall and prints each swapped type's footprint against the cell; `tools/test_dsx_overlay.py` uses stand-in assets. The DSX pack is licensed for internal evaluation only (NVIDIA Sample Data License for Evaluation, section 2(c) forbids making it available to others), so it and anything converted from it never go in the repo or on the website; `/dsx/` and `*_dsx.usda` are git-ignored. Guide in `docs/dsx-assets.md`
- `tools/usd_to_unity.py`: `.usda` → layout bundle (`layout.json` + `assets/<id>.glb`), tested by `tools/test_usd_to_unity.py`
- `unity/`: macOS app on Unity 6000.6.1f1 + URP + glTFast 6.20.0
  - `Assets/DataHall/Runtime`: `LayoutData` (parsing and validation), `HallCoordinates` (USD (x, y, z) → Unity (-x, z, -y)),
    `CapacityModel` (C# port of `sim.ts`), `HallBuilder`, `HallApp` (entry point and Chinese IMGUI panel), `OrbitCamera`
  - `Assets/DataHall/Editor`: `ProjectSetup` (URP, scene, player settings), `BundleImporter` (imports layout bundles, generates prefab variants), `BuildMac`
  - `Assets/DataHall/Generated`: imported models and equipment library, updated by `tools/unity_sync.sh`; `Assets/DataHall/Prefabs`: prefab variants of the models, interactions are added here
  - `Assets/DataHall/Tests/EditMode`: EditMode tests; `Fixtures/axis_probe.glb` is generated by `tools/make_unity_fixtures.py`
  - `Native/DataHallNative.m` → `Assets/Plugins/macOS/DataHallNative.bundle` (`tools/build_native_mac.sh`, requires Xcode):
    open-file dialog (NSOpenPanel) and dragging files into the window; C# wrapper `Runtime/NativeMac.cs`, loaded only in the built macOS app

## Running

```bash
brew install git-lfs && git lfs install   # the repo stores binary assets in Git LFS (rules in .gitattributes); install before cloning; if already cloned, run git lfs pull
cd web && npm i
npm run dev        # dev server
npm run typecheck  # tsc type check (also run in CI)
npm test           # vitest
npm run catalog-check  # catalog freshness: devices unchecked for over 90 days (exit 1), old sources and source hosts (information only)
npm run build      # output in web/dist, base is a relative path, deployable under any subpath
# Deploy: Vercel project lai3ds-projects/datahall is linked to this repo, Root Directory is web; merging to main publishes production, PRs get automatic previews

python3 -m venv .venv && .venv/bin/pip install usd-core jinja2
.venv/bin/python tools/validate_usd.py samples/datahall.usda
.venv/bin/python -m unittest discover -s tools
tools/gen_schema.sh             # after changing schema/schema.usda (uses the .venv python by default)
tools/gen_schema.sh --validate  # check whether generated files are stale
export PXR_PLUGINPATH_NAME=$PWD/schema  # lets usdview and Omniverse recognize the schema
tools/simready_setup.sh && .simready/venv/bin/python tools/simready_audit.py samples/datahall.usda  # SimReady audit (requires uv)

# Unity version (editor /Applications/Unity/Hub/Editor/6000.6.1f1, override with UNITY=...)
tools/unity_sync.sh [file.usda]   # import all equipment models, then set file.usda (default samples/datahall.usda) as the default layout
tools/unity_test.sh               # EditMode tests
tools/unity_build.sh              # build build/DataHall.app and run batchmode smoke assertions; LAYOUT=path uses a different layout
tools/unity_native_smoke.sh       # native plugin smoke test (pops up a window for a few seconds): drag and drop, auto-cancelled dialog, failed open keeps the hall
tools/build_native_mac.sh         # rebuild the plugin after changing unity/Native/DataHallNative.m
build/DataHall.app/Contents/MacOS/* -layout path/to/layout.json   # open a layout exported from the web version
```

## Design decisions

- **Capacity comparisons** use `sim.ts`'s `over(need, cap)` (tolerance `KW_EPS`), not `>`: summing the same devices in a different order changes the last bits of a float, and dragging reorders the list, so an exact comparison can report a shortage that appears and disappears as devices move. `supply.ts` already compared with a tolerance
- **Device type names from outside the app** (share links, saved layouts, `.usda` files) are looked up with `Object.hasOwn(CAT, type)`: `CAT` is a plain object, so `constructor` or `toString` would otherwise pass as a device type and put a broken device in the hall
- **Capacity model**: five constraints — power distribution (RPP), liquid cooling (CDU), air cooling (in-row coolers), back-end network ports, utility power; if any is not met, the hall cannot power on.
  PUE estimate: `(IT + equipment overhead + liquid-cooled heat × 0.08 + air-cooled heat × 0.30 + IT × 0.05) / IT`, a simplified formula for teaching.
  - The web version also has a per-device check (`supply.ts`): even when totals are sufficient, if the liquid-cooling heat assigned by proximity to a CDU, or the power assigned to an RPP, exceeds its capacity, the hall cannot power on.
    When totals are already insufficient, only the totals are reported, without repeating per device. In the 3D view, overloaded CDUs and RPPs and unconnected equipment show red on top, and links to overloaded equipment are drawn red.
    `compute()` and `spec/capacity-cases.json` do not include the per-device check (the contract shared with Unity is unchanged).
  - Presets must pass both the total and per-device checks (`sim.test.ts`). That is why facilities in the Rubin preset are placed in a repeating CDU, RPP, IB, air-conditioner cycle.
- **OpenUSD conventions**: Z up, metersPerUnit = 1, defaultPrim = `/DataHall`.
  - `/DataHall/Catalog/<id>`: `class` prototypes, with parameters, simplified geometry and their own `Looks` (UsdPreviewSurface); geometry binds to materials inside the prototype
  - `/DataHall/Equipment`: `kind = "group"`; `/DataHall/Equipment/Rxx_Cyy`: `kind = "component"`, `instanceable` instances referencing Catalog prototypes
  - SimReady-related (`docs/simready-audit.md`): geometry is non-subdivided `Mesh` (sharing one unit cube, positioned by translate/scale); do not switch back to `Cube`;
    `customLayerData` carries SR.001 fields; the generation date is passed by the caller via `buildUsda(..., {date})`, and `npm run sample` keeps the sample's original date
  - Parameters are `dchall:` namespaced attributes defined by a codeless applied API schema (schema 0.2), not written as `custom`:
    - `DataHallAPI`: applied on `/DataHall`; utility power and grid size
    - `DataHallEquipmentAPI`: applied on Catalog prototypes, inherited by instances through the reference; equipment parameters, grid position, `dchall:powerFeed`→RPP.
      Capability fields (liquid cooling/air cooling/power distribution/ports) all live here, written as 0 where not applicable; no separate capability APIs
    - `LiquidCooledAPI`: applied only on prototypes with `liq > 0`; `dchall:liquidFraction`, `dchall:coolantSource`→CDU
  - Attribute names and types stay identical to the 0.1 custom attributes; without the plugin loaded, files still open and attribute values are still readable. 0.1 files have no `apiSchemas`, and validation requires re-exporting them
  - Schema docs are in English: usdGenSchema truncates the first sentence into `userDocBrief` and appends an English period, so a Chinese full stop becomes "。."
  - Order for changing attributes: `schema/schema.usda` → `tools/gen_schema.sh` → `web/src/usd-export.ts` → `npm run sample` → `validate_usd.py`
  - How to swap in high-fidelity models: write an `over` on the Catalog prototype in a stronger layer, but **do not add a reference directly on the prototype**: AIF equipment assets face +X, while this project faces -Y;
    create a child Xform under the prototype that references the asset, with `rotateXYZ = (0, 0, -90)` and `kind = "subcomponent"`; see `docs/simready-audit.md`
- **Importing .usda**: reads only the root layer, does not expand sublayers or external references, does not support binary usdc (the message suggests converting with usdcat).
  - Equipment type comes from `references = </DataHall/Catalog/<id>>`; position is taken from `dchall:gridColumn/gridRow` (inferred from the `Rxx_Cyy` name when missing),
    `translate` is only used to flag inconsistencies; equipment parameters come from `catalog.json`, and parameters in the file only produce difference messages
  - Deactivated (`active = false`), unknown-type, out-of-bounds, overlapping and externally referenced equipment is skipped with a message; a grid size different from the current one is rejected outright
  - Importing replaces the current hall; messages contain file content, so the UI must write them only via `textContent`
- **Share links**: `#layout=<version>,<utility MW>,<type>:<column>.<row>-<column>.<row>,...`, columns and rows start at 0, consistent with layout.json and USD.
  - Hash instead of query parameters: not sent to the server, no configuration needed for static hosting; updated on every edit with `history.replaceState` (no history entries)
  - When the page opens, the layout in the link takes precedence over localStorage; manually editing the hash triggers `hashchange` and reloads; invalid entries are skipped with a message, unsupported versions are not loaded
  - Changing the format requires bumping the version and keeping decoders for old versions; links already sent out must not break
  - Version 2: manual assignments appended after the equipment groups, `@c:<column>.<row>_<CDU column>.<CDU row>-...` (coolant), `@p:...` (power distribution)
  - Version 3: adds deployment phases `@<phase>:<column>.<row>-...` (only phases greater than 1). Encoding uses the lowest version that can express the content: 2 when there are no phases, 1 when there are also no manual assignments
- **Unity version**: `layout.json` is the only layout format Unity reads; the web "导出给 Unity" (Export for Unity) output and `tools/usd_to_unity.py` output must match field by field (compared in tests).
  - Equipment geometry comes from glb, and prefab variants are generated after import; interactions modify the variants, not `Generated/`. After changing exported geometry or colors, run `tools/unity_sync.sh`
  - Colors: USD stores linear values (the exporter converts the sRGB palette before writing), glTF is linear too; the Unity project uses linear color space, and IMGUI texture colors must use `.linear`
  - The built app runs in background by default, otherwise the main loop pauses when launched from a terminal; `OpenScene(Single)` unloads unreferenced assets, so they must be reloaded afterwards
  - Opening from within the app: a panel button pops up NSOpenPanel (in Update, not in OnGUI), or drag a file into the window; a failed open keeps the current hall and shows a message.
    Drag and drop works by adding drag methods to Unity's `PlayerWindowView` class: NSView has default implementations, so only Unity's own classes below NSView are checked, and if one already implements them we do not take over.
    System drag gestures and dialog clicks cannot be automated; the smoke test calls the real view's `performDragOperation:` with a fake dragging object
  - Re-running `ProjectSetup` rebuilds the scene (fileIDs change) and may modify `UniversalRenderPipelineGlobalSettings.asset`; if the content has not changed, do not commit these changes
- **Supply relationships** (`grid.ts`'s `supplyLinks`, shared by USD export, layout.json, per-device capacity check and links): by default connect to the nearest CDU / RPP (distance across rows is doubled; ties go to the lower row, then the lower column, so the result never depends on list order, which dragging changes);
  equipment can be manually assigned to a specific unit (`feeds: {coolantSource: [x, z], powerFeed: [x, z]}`; in layout snapshots it is `[type, x, z, feeds]`).
  - When the assigned cell is not the matching supply equipment (deleted, type changed) or is removed in a failure drill, fall back to the nearest; `edit()` removes stale assignments pointing to deleted equipment, and assignments follow supply equipment when it is dragged
  - Manual assignments go into undo history, localStorage and share links; USD and layout.json formats are unchanged, since relationships are already written per device. Importing .usda reads the relationships and records as manual assignments only those that differ from nearest assignment;
    references to equipment that was not imported produce a message and fall back to nearest (the pxr converter writes empty in this case, so such broken files differ between the two; valid files match field by field, `test_manual_assignment_and_phase_match_web_export`)
  - UI: in equipment details, "冷却液来自 / 配电来自" (Coolant from / Power from) are dropdowns (first item is nearest); in CDU / RPP details, "指定接入设备" (Assign devices) enters pick mode: click equipment to connect it, click again to restore nearest, Esc to finish. Manually assigned links are drawn dashed
- **Layout snapshot entries**: `[type, x, z]` or `[type, x, z, {feeds?, phase?}]` (`edit.ts`'s `toItem` / `toEntry`), used by undo history, localStorage and presets.
  On 2026-09-17 a form where the 4th item was feeds directly was briefly released; `entryProps` stays compatible when reading it
  - localStorage is untrusted: `layout.ts`'s `parseSavedLayout` keeps only valid entries (known type, integer cell inside the grid, no duplicate cells, valid feeds and phase) and never throws, so a corrupt save cannot stop the page from loading
- **Growth planning**: each piece of equipment has a deployment phase (`phase`, starting at 1, 1 is not written, at most `growth.ts`'s `MAX_PHASE` = 20, shared by the UI, share links, localStorage and .usda import). The check for phase n includes all equipment with phase ≤ n, with reasons matching the "cannot power on" conditions (`blockingReasons`).
  - Phases go into undo history, localStorage, share links (version 3), USD (`DataHallEquipmentAPI`'s `int dchall:phase`, written on the instance only when greater than 1),
    layout.json (equipment `phase`, written by both generators, optional in the schema with default 1; the Unity C# does not read it yet)
  - UI: which phase new equipment goes into ("+" opens a new phase); "查看到第几阶段" (View up to phase) and clicking table rows are view state, which does not change the layout or enter undo history; equipment in later phases is dimmed and excluded from calculations and the N+1 check;
    the phase can be changed in equipment details. The viewed phase switches back to all automatically when newly placed equipment exceeds it
  - How many more units fit (`headroom`) is computed only from whole-hall totals (each unit's demand increment is consistent with `sim.ts`'s PUE formula), ignoring free floor cells and per-device CDU / RPP assignment; tests guarantee that adding the computed number still passes and one more does not
- **Failure drills**: failures can be marked on facilities that provide capacity (CDU, RPP, in-row coolers, IB switch racks), not on GPU racks or storage racks.
  - Failed facilities are removed from calculations: they provide no capacity and draw no power, and the remaining equipment is reassigned to the nearest via `supplyLinks`; in 3D they are semi-transparent, cast no shadows, are not lit, and their links are not drawn
  - Failure marks (`state.failed`, keyed by cell) are not part of the layout, undo history, share links or exports; they move with the equipment when dragged, and are kept after undo/redo if the cell still holds a failable facility;
    loading a preset, importing a file or opening a share link clears them. Marking a failure does not cut power; once powered on, power can be turned off even if the drill causes problems
  - The N+1 check targets the complete layout (ignoring the current drill): it fails each facility individually in turn and lists the equipment and reasons that would make the hall fail the capacity check; no check when the layout itself does not pass
  - The `gb200n1` preset is the N+1 example; other presets are not required to be N+1
- **Editing**: every operation that changes the layout goes through `main.ts`'s `edit()`, and an undo history entry is recorded only when the layout actually changes (up to 100 entries),
  including place, delete, row placement, drag, changing utility power, loading presets, importing files and opening share links; the load at startup and undo/redo themselves are not recorded.
  - Dragging: if there is equipment at the press position, move it, otherwise rotate the view. When pressing on the side of equipment, the floor under the pointer is a cell further back, so equipment moves by the number of cells the pointer moves, not to the cell under the pointer;
    empty cells passed over take effect immediately (links and capacity check follow), occupied cells are skipped, releasing records one history entry; a second finger touching down cancels the drag
  - Row placement: choose "整排" (Row), click the first cell, then the last cell; empty cells are filled along the direction with the larger cell difference (along the row when equal); touch screens have no hover, so only the first cell is previewed
  - Shortcuts: ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo, Delete / Backspace deletes the selected equipment, Esc steps back one level at a time: assign mode, then the row start cell, then the chosen device type, then the selection
  - Keyboard in the 3D view: the canvas is focusable (`tabIndex 0`, `role="application"`, labeled through `tr`), the arrow keys move `state.cursor` (previewed by the same ghost as the mouse and read out by the visually hidden `#cursorStatus`),
    Enter or Space acts on the cursor cell exactly as a tap does (place, row ends, select, assign mode), and Esc steps back level by level and then returns focus to the page. `#panel` is the page's `<main>` landmark; `#stage` is a labeled region, so the HUD and the overlay buttons sit inside one
  - Under the dev server, `window.__datahall` exposes `state`, `cellToScreen`, `visibleGhosts`, `renderOnce` for browser automation (not in production builds).
    When the automated browser window is in the background, requestAnimationFrame pauses: the view and camera matrices do not update, so call `renderOnce()` first, and take screenshots with the canvas's `toDataURL`
- **Narrow screens** (below 900 px, where the panel sits under the 3D view): `ui.tsx`'s `StageBar` and `PanelBar` render on every size but CSS shows them only here.
  - Stage bar (`#stageBar`), above undo / redo / reset at the bottom of the stage: what a tap does now (assign mode, then placing or row placement, then the selected device), with Done, or Details and Remove.
    After a placement tap it says how many of that device the hall holds (`state.ui.lastPlaced`, cleared when the tool changes)
  - Panel bar (`#panelBar`): sticks to the top of the scrolling panel (negative margins cancel the panel padding; the sticky tutorial card sits below it) with the hall status and a toggle that folds the panel down to the bar
    (`state.ui.panelCollapsed`, view state only, via the `panel-collapsed` class on body)
  - Placement feedback on every screen: placed devices grow up from the floor for 220 ms (`scene.ts`'s `popMesh`, skipped with reduced motion; `renderOnce` finishes it immediately so snapshots and tests never see a half-grown rack) and touch taps vibrate where supported
  - Portrait views keep the horizontal field of view of a square view (`resize` in `scene.ts`), so the hall still fits across a phone with the panel folded away
- **Repair suggestions** (`ui.tsx`'s `Repair`, `#repair` under the capacity issues): shown when the hall cannot power on, hidden during the tutorial (it teaches adding units by hand). Each option is one sentence with an Apply button (`#repairApply`, `#repairApplyAlt`);
  `main.ts`'s `applyRepair` re-plans from the current hall before applying, as one undo entry, and new units pop up. Planning runs on the calculated devices (not failed, within the viewed phase) but avoids every occupied cell; new units go into the current placement phase
- **Scenarios** (`ui.tsx`'s `Scenarios` list and `ScenarioCard` at the top of the panel, `#scenario`): `state.scenario` holds `{id, done}`; `main.ts` loads the starting hall like a preset and checks the condition inside `refresh()` (`checkScenario`).
  Completion conditions take `CAT` and the grid, and guard against emptying the hall: a scenario cannot be finished by deleting racks, and the `sameFeed` lesson pins its feed and wants as many Vera Rubin racks as that feed can run.
  Completion reports the virtual page `/scenario-<id>-done`, with no layout content. Presets, imports and share links leave the scenario; generating from a goal does not (`loadLayout(p, keepScenario)`), because a scenario can ask for it
- **Start from a goal** (`ui.tsx`'s `GoalForm`, `#goal` after the presets): the form fields are a draft in the component; `main.ts`'s `generateGoal` loads the result like a preset (one undo entry, ends the tutorial, sets the feed) and stores a summary in `state.ui.goal`, which any later change clears (`changed()`)
- **Provenance of exports**: `.usda` (`customLayerData`'s `dchall:catalogVersion` and `dchall:modelVersion`), `layout.json` (the same two fields, written by both generators), the architecture report (in its footer) and `spec/capacity-cases.json` record which catalog data and which capacity model produced the figures; the methodology dialog shows both (`#methodVersions`).
  `CATALOG_VERSION` comes from the catalog file, `MODEL_VERSION` lives in `sim.ts` and is bumped when `compute()` or `PUE_FACTORS` change. Importing a `.usda` from a different catalog version says so and still computes from the current catalog.
  Share links carry no version on purpose: adding one would need a new link version, and every link already out there must keep working
- **Architecture report** (`report.ts`, button `#reportExport` in the OpenUSD section, saved as `datahall-report.html` through the same saver as the other exports): one self-contained HTML file with the 3D view screenshot, a bill of materials, the summary figures, capacity issues, N+1 findings, annual energy, the notes and sources of the device types used, the methodology dialog's assumptions, both versions and the share link.
  Inline CSS only, no external requests, and a print stylesheet so it becomes a sensible PDF. Its copy goes through `tr()` like the rest of the app; everything else comes from the hall, which is passed in whole (`itemList()`: every phase, ignoring the failure drill), so the report does not depend on what the panel is currently showing.
  Every value that comes from data is escaped (`esc`), a screenshot is embedded only when it is an image data URL and a link only when it is http(s), because device names, notes and source titles are data
- **Methodology dialog** (`ui.tsx`'s `Method`, a modal `<dialog id="method">`): explains the five checks, the per-device check, the PUE formula and why its coefficients are what they are, prices, energy and the ownership estimate, the limits of the planning estimates, and lists every catalog note.
  Opened from "How the model works" under the subtitle or from links next to the sections it explains (`data-method="checks" | "cost" | "planning"`), which scroll to that section (`state.ui.method`, view state).
  Capacities and coefficients in the text are read from the catalog and `PUE_FACTORS`, never typed into the copy, so changing the model updates the explanation
- **Load visualization** (`scene.ts`):
  - CDUs and RPPs have a 5-segment load meter in a recess on the right of their front (`setLoads`, called from `refresh()` before `setDimmed`, because swapping segment materials resets the dimming cache). Segments light from the bottom by nearest-assigned load, rounding up;
    the color is the device color below 80%, amber from 80% and red above capacity (`viz.ts`'s `meterFor`). Failed and later-phase devices show an empty meter
  - While powered on, dots flow along each link from the supply device to the consumer (one `THREE.Points` per supply kind, positions rewritten each frame; red for overloaded supplies). Lines dim to let the dots read.
    With reduced motion there are no dots and powered lines stay bright
  - Test hooks: `window.__datahall.meters()` (meter state by cell key) and `flowDots()` (number of visible dots). Read the canvas in the same task as `renderOnce()`: without `preserveDrawingBuffer` a later task gets a blank image
- **3D rendering** (three 0.186): color management is on by default; CSS colors are read as sRGB, converted to linear space for computation, and output as sRGB; no tone mapping, so palette colors do not shift.
  Lighting uses physical units, and intensities must be π times the r128 values for equivalent brightness; the sun light casts shadows (only equipment bodies cast, the floor receives, the shadow camera covers the whole hall).
  `PCFSoftShadowMap` was removed in r186; use the default `PCFShadowMap`.
  Device bodies are one box with six materials (+x, -x, top, bottom, front +Z, back); the front carries the `rack-faces.ts` maps, and `setDimmed` walks material arrays. No environment map: a PMREM room reflection barely showed but tripled load time under software rendering (Playwright's SwiftShader), so it was dropped
- **Grid coordinates**: three.js on the web is Y-up; on export `(x, y, z)_three → (x, -z, y)_usd`. Cells are 0.6m × 1.2m, 16 columns × 10 rows.

## Next steps (by priority)

The web version is the current focus (decided 2026-09-17), positioned as a demo for sharing and teaching; the Unity version is paused. See `docs/roadmap.md` for the quarterly plan.

1. Unity version (paused): panel covering the 3D view, power-on animation and links, tray teardown, real SimReady assets (option A5, see `docs/unity-options.md`).
   Unity USD Importer fails to compile on 6000.6, do not use it; the fallback for reading USD directly at runtime is B3.

## Data reliability

Figures in `spec/catalog.json` are public estimates for teaching, **not engineering data**. The file's `version` is its data version: the newest `checked` date of its sources, kept in step by `web/tests/catalog.test.ts`; bump it with the sources whenever a figure changes. Every entry carries `sources` (schema in `spec/catalog.schema.json`, checked by `web/tests/catalog.test.ts`):
- Dense air-cooled racks are flagged with `airDense` in the catalog, not by id in `sim.ts`; the warning names the rack and its power. Unity's C# keeps its own id list, since `layout.json` does not carry the flag
- Each source has `title`, `type` (`official`: the maker's own documents, including OEM product guides; `reported`: press and analysts; `estimate`: this project's reasoning, no URL), `checked` (date last compared with the catalog value) and `supports` (the catalog fields it backs; empty for context-only sources). Non-estimates need `url` and `publisher`; `date` is omitted for undated product pages
- Every numeric field of an entry must be backed by at least one source; `ranges` records the range sources give, and the simulation value must fall inside it
- When changing a value: update the source (or add one), `checked`, `ranges`, and the Chinese and English notes together, then `npm run capacity-cases`, `npm run sample` and `tools/make_import_fixtures.py`; the schema-0.1 import fixture keeps old values, so its expected warnings change
- `npm run catalog-check` (`web/scripts/catalog-freshness.ts`) reports which figures are due for a re-check: devices whose newest `checked` date is over 90 days old (the only thing that fails, exit code 1), sources published over 18 months ago that still back a figure, and how the evidence spreads across source hosts; the thresholds are named constants in that file
- The UI shows sources in the device details (publishers only) and in full in the methodology dialog

Last full check 2026-09-18. Choices made then:
- GB300 NVL72: 140 kW within 132–142 kW (NVIDIA up to 142 kW, Supermicro 132 kW), 90% liquid (Lenovo), about $4.3M (Wolfe Research, 2026-01); GB200 about $3M from the same report
- Vera Rubin NVL72: NVIDIA publishes no rack power; 190 kW is Max-Q from Ming-Chi Kuo (Max-P about 230 kW, 2026-01); 100% liquid per NVIDIA; $5–7M (Tom's Hardware, 2026-03)
- Kyber is named Vera Rubin Ultra NVL144 (Kyber): 144 GPUs by package; 600 kW is the GTC 2025 design figure, not restated for the 2026 design; reported slip to 2028; $7–8.8M reported
- AMD Helios: 225–245 kW (StorageReview, 2026-07), $5–5.5M (Futurum via CNBC, 2026-07); MI355X rack up to 120 kW (GIGABYTE), liquid share and price are estimates
- Huawei CloudMatrix 384 (`cm384`, the Atlas 900 A3 SuperPoD compute rack): 32 Ascend 910C NPUs counted as GPUs; the 4 air-cooled UnifiedBus switch racks are not modeled separately, so the whole system's about 559 kW (Tom's Hardware, 2025-04) and about $8M (TrendForce citing FT, 2025-07) are spread over the 12 compute racks: 47 kW, 70% liquid and $0.67M per rack are estimates. It is not an air-cooled dense rack, so the `dgx` density warning did not need to become a catalog flag yet
- DGX B200 stays (14.3 kW per system, NVIDIA) rather than switching to B300: changing what the `dgx` id means would silently change old share links
- Support units: CDU 800 kW within Vertiv's 600–2300 kW range; the 120 kW in-row cooler stands in for about two real units (58–70 kW each); the 800 kW RPP is a high-density panel; IB rack of 288 ports is about two Q3400 switches; all their prices are estimates
- PUE context in the methodology dialog: weighted average annual PUE 1.54 in 2025, 1.44 for facilities of 20 MW and above (Uptime Institute Global Data Center Survey 2025)
- Default electricity price (`energy.ts`): 8.62 ¢/kWh, the 2025 US industrial average (US EIA, Electric Power Monthly, table 5.3), excluding taxes, demand charges and fixed fees. The 80% average load is an assumption
- Ownership estimate (`ownership.ts`): the 5% of hardware per year for maintenance and the ±30% / ±20% / ±25% sensitivity bands are assumptions with no source, labeled as such in the UI, like the 80% average load
- Back-end fabric (checked 2026-09-21): Q3400 has 144 ports at 800G (NVIDIA switch manual); no document supports splitting a Q3400 port into 2 × 400G, so the model never does. GB300 NVL72: 4 ConnectX-8 per compute tray, 72 NICs, 4 rails (DGX GB300 user guide and SuperPOD RA). Vera Rubin NVL72: 8 ConnectX-9 per tray at 800G, 144 NICs over two independent planes, 8 rails (SuperPOD RA, 2026-09). GB200 and DGX B200 are marked `quantum2` (their SuperPOD RAs use QM9700 NDR), Helios, MI355X and CloudMatrix 384 `ethernet`, Kyber `unsourced`.
  Cable classes at 800G: active copper splitter to a NIC 2 m (MCA7K10; the interconnect page says 2.5 m but no 2.5 m part is listed), AEC switch to switch 3 m (MCA4K50), single-mode DR4 500 m (MMS4A00 / MMS4A20). No passive copper (usable under 0.7 m at XDR) and no multimode part exists at 800G. NVIDIA publishes no distance-to-cable guide, so picking the shortest class that covers a run is this model's rule. The `ib` rack's `ports` stays 288 (two switches); its note says a non-blocking two-tier fabric uses about three switch ports per GPU
- Scale references (`scale.ts`): DGX Spark 240 W (its power adapter rating), US home about 1.2 kW average (about 10,500 kWh a year, US EIA). A Mac Studio reference waits for a sourced power figure

## Style

- Docs (`docs/`, README, CLAUDE.md) and code comments are written in English (decided 2026-09-17). UI copy stays bilingual (English by default, plus Simplified Chinese); `catalog.json` `name` and `note` keep Chinese as the source text. `docs/roadmap.zh.md` is the Chinese copy of the roadmap; edit both together
- Elements with `display` set (`.row`, `.h2row`) rely on the global `[hidden]{display:none !important}` to be hidden with the `hidden` attribute
- The UI defaults to English and supports Simplified Chinese. Both languages use sentence-style copy; English uses sentence case, no all-caps labels
- Issue text in `spec/capacity-cases.json` is always generated in Chinese (`buildCases` temporarily switches to Chinese), and Unity's C# capacity model compares it verbatim; when changing the Chinese wording of capacity issues, update the C# as well
- Source titles in `catalog.json` keep the publication's own language; only this project's own `estimate` notes carry a `i18n.zh.title` (`i18n.ts`'s `srcTitle`)
- The content of exported files (`.usda` comments and README, `layout.json`) does not change with the UI language; the architecture report is the exception, since it is written for people to read
- Fixed color semantics: NVIDIA GPU green, AMD GPU rose (`--amd`), Huawei blue (`--huawei`), coolant cyan, power distribution copper, network purple. Rose was chosen over AMD red and blue over Huawei red so racks never look like the red overload marker. A new color also needs an entry in `usd-export.ts`'s `PALETTE` and in the color test in `sim.test.ts`
- Answer directly, no pleasantries.
