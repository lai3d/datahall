# GPU Data Hall Builder

A simulator for laying out an AI data hall around the latest AI GPU racks: NVIDIA GB200/GB300 NVL72, Vera Rubin NVL72 and Rubin Ultra Kyber, and AMD Helios and MI355X. Place racks, power panels, coolant units and network switches on a grid. See whether power distribution, cooling, network ports and utility capacity can carry the load. Then export the hall as OpenUSD.

**Live demo:** https://datahall-eight.vercel.app ([中文界面](https://datahall-eight.vercel.app/?lang=zh))

The live demo uses [Vercel Web Analytics](https://vercel.com/docs/analytics) for aggregate page views. It sets no cookies, and the layout in the URL hash is not sent.

![A Vera Rubin NVL72 row powered on, with coolant and power links drawn to the CDUs and RPPs](docs/images/web.png)

> Power and price figures are rough estimates from public reports and supply chain sources, not NVIDIA or AMD specifications. Use them for learning, not engineering design.
>
> This is an independent project. It is not affiliated with, endorsed by or sponsored by NVIDIA or AMD. NVIDIA, GB200, GB300, Vera Rubin, Kyber, Omniverse and SimReady are trademarks of NVIDIA Corporation; AMD, Instinct, Helios and EPYC are trademarks of Advanced Micro Devices, Inc. They are used here only to describe the equipment being simulated.

## Features

- **Capacity model.** Five constraints must all hold before the hall can power on: power distribution (RPP), liquid cooling (CDU), air cooling (in-row coolers), back-end network ports and utility power. A simplified PUE estimate is shown alongside.
- **Per-device checks.** Each rack is fed by its nearest CDU and RPP. An overloaded supply blocks power-on even when hall totals are fine. Overloaded supplies and unconnected devices are marked red in 3D.
- **OpenUSD export and import.** The export is Z-up, in meters, and uses instanceable equipment that references catalog prototypes. Parameters are defined by a codeless applied API schema (`dchall:` namespace). The page can re-import its own `.usda` files, including files re-saved by usdview or Omniverse.
- **Manual supply assignment.** Racks connect to the nearest CDU and RPP by default. You can pick a different one per rack, or select a CDU or RPP and click the racks it should feed. The choice is kept in USD, layout.json and share links.
- **Growth plan.** Put devices into deployment phases. A phase table checks everything built up to each phase, you can view the hall as of any phase, and a headroom estimate shows how many more racks fit before power, cooling or ports run out.
- **Failure drill.** Mark a CDU, RPP, in-row cooler or IB switch rack as failed and watch its load move to the nearest working unit. An N+1 check lists every device whose single failure would break the hall.
- **Guided tutorial.** First-time visitors can build a small GB200 hall step by step and learn why it cannot power on until power distribution, cooling and networking are added.
- **Editing.** Drag a device to move it, place a whole row with two clicks, and undo or redo any change (⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y). Delete removes the selected device.
- **Load you can see.** CDUs and power panels carry a load meter that turns amber near capacity and red when overloaded, and power and coolant flow along the links once the hall is on.
- **Annual energy.** Enter an electricity price and an average load to see yearly IT and facility energy, the annual PUE and the electricity bill.
- **Rack comparison.** For the current utility feed, how many racks of each type fit with just enough support equipment, their GPUs, floor space, PUE and price. The HUD puts the IT load in everyday terms (DGX Sparks, US homes).
- **Works on phones.** The panel folds away to give the 3D view the screen, and a bar on the 3D view shows what a tap will do.
- **Share links.** The layout is encoded in the URL hash, so the address bar always links to the current hall. Shared links show a preview image, and "Save image" downloads the 3D view as a PNG.
- **English and Simplified Chinese UI.**
- **Unity app (macOS, paused).** It reads the same layout through `layout.json` plus glTF models converted from USD.

## Tech stack

| Area | Stack |
| --- | --- |
| Web app | TypeScript 7 (strict), Vite 8, React 19 for the panel, three.js 0.186 for the 3D view (plain three.js, no React bindings) |
| Web tests | vitest for the pure logic, ajv (layout.json schema), Khronos glTF-Validator, Playwright browser smoke tests |
| Hosting | Vercel (production from `main`, preview per pull request), Vercel Web Analytics |
| Data formats | OpenUSD `.usda` with a codeless applied API schema (`dchall:`), `layout.json` (JSON Schema 2020-12), share links in the URL hash |
| USD tooling | Python with `usd-core` 26.8 (OpenUSD), `usdGenSchema`, NVIDIA SimReady Foundation / OAV rules for the audit |
| Unity app | Unity 6000.6 (URP), glTFast, a small Objective-C plugin for the macOS file dialog and drag and drop |
| CI | GitHub Actions: type check, vitest, build, schema freshness, USD validation, Python tests |
| Repo | Git LFS for binary assets |

## Repository layout

| Path | Contents |
| --- | --- |
| `web/` | Web app (TypeScript, Vite, three.js). Deployed to Vercel from `main`. |
| `spec/` | `catalog.json` (the single source of device data), `layout.schema.json`, shared capacity test cases |
| `schema/` | Codeless USD schema plugin (`schema.usda` plus generated files) |
| `samples/datahall.usda` | Reference export, also the golden file for export tests |
| `tools/` | USD validation, schema generation, SimReady audit, USD → Unity converter, Unity build scripts |
| `unity/` | Unity 6 (URP) macOS app |
| `docs/` | SimReady audit report, Unity approach comparison |

Binary assets (glb, png, native plugins) are stored with Git LFS. Install it before cloning:

```bash
brew install git-lfs && git lfs install
```

## Web app

```bash
cd web
npm install
npm run dev        # dev server
npm run typecheck  # tsc, type check only
npm test           # vitest
npm run build      # output in web/dist (relative base, deployable under any path)
```

Pull requests get a Vercel preview deployment. Merging to `main` publishes production.

## USD tooling

```bash
python3 -m venv .venv && .venv/bin/pip install usd-core jinja2
.venv/bin/python tools/validate_usd.py samples/datahall.usda   # schema-based validation
.venv/bin/python -m unittest discover -s tools                 # Python tests
tools/gen_schema.sh                                            # after editing schema/schema.usda
export PXR_PLUGINPATH_NAME=$PWD/schema                         # let usdview / Omniverse see the schema
```

`tools/simready_setup.sh` and `tools/simready_audit.py` check exports against NVIDIA SimReady Foundation rules. They need `uv`. Results are in [docs/simready-audit.md](docs/simready-audit.md).

## Unity app (macOS)

Needs Unity 6000.6.1f1. Development is paused while the web app is the focus.

```bash
tools/unity_sync.sh     # import device models and the default layout
tools/unity_test.sh     # EditMode tests
tools/unity_build.sh    # build build/DataHall.app and run a smoke test
build/DataHall.app/Contents/MacOS/* -layout path/to/layout.json
```

Use "Export for Unity" in the web app to produce `layout.json`, or convert a `.usda` file with `tools/usd_to_unity.py`.

## CI

GitHub Actions runs on pushes to `main` and on pull requests:

- **web job:** type check, vitest and the production build
- **usd-tools job:** schema freshness, sample validation and the Python tests

Unity isn't built in CI.

## License

[MIT](LICENSE).

## Contributing notes

Design decisions and conventions live in [CLAUDE.md](CLAUDE.md), written in Chinese. It covers the coordinate system, schema versioning, share-link format and data sourcing rules. When changing power or price figures in `spec/catalog.json`, cite the source in the item's note.
