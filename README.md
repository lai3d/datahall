# GPU Data Hall Builder

A simulator for laying out an AI data hall around the latest AI GPU racks: NVIDIA GB200/GB300 NVL72, Vera Rubin NVL72 and Vera Rubin Ultra NVL144 (Kyber), AMD Helios and MI355X, and Huawei CloudMatrix 384. Place racks, power panels, coolant units and network switches on a grid. See whether power distribution, cooling, network ports and utility capacity can carry the load. Then export the hall as OpenUSD.

**Live demo:** https://datahall-eight.vercel.app ([中文界面](https://datahall-eight.vercel.app/?lang=zh))

The live demo uses [Vercel Web Analytics](https://vercel.com/docs/analytics) for aggregate page views. It sets no cookies, and the layout in the URL hash is not sent.

![A Vera Rubin NVL72 row powered on, with coolant and power links drawn to the CDUs and RPPs](docs/images/web.png)

> Power and price figures are rough estimates from public reports and supply chain sources, not NVIDIA or AMD specifications. Use them for learning, not engineering design.
>
> This is an independent project. It is not affiliated with, endorsed by or sponsored by NVIDIA or AMD. NVIDIA, GB200, GB300, Vera Rubin, Kyber, Omniverse and SimReady are trademarks of NVIDIA Corporation; AMD, Instinct, Helios and EPYC are trademarks of Advanced Micro Devices, Inc. They are used here only to describe the equipment being simulated.

## Features

The builder (utility feed, devices, capacity check, device details) is always on screen; everything else is grouped under three tabs: **Learn**, **Design** and **Drill**.


- **Capacity model.** Five constraints must all hold before the hall can power on: power distribution (RPP), liquid cooling (CDU), air cooling (in-row coolers), back-end network ports and utility power. A simplified PUE estimate is shown alongside.
- **Per-device checks.** Each rack is fed by its nearest CDU and RPP. An overloaded supply blocks power-on even when hall totals are fine. Overloaded supplies and unconnected devices are marked red in 3D.
- **OpenUSD export and import.** The export is Z-up, in meters, and uses instanceable equipment that references catalog prototypes. Parameters are defined by a codeless applied API schema (`dchall:` namespace). The page can re-import its own `.usda` files, including files re-saved by usdview or Omniverse.
- **Manual supply assignment.** Racks connect to the nearest CDU and RPP by default. You can pick a different one per rack, or select a CDU or RPP and click the racks it should feed. The choice is kept in USD, layout.json and share links.
- **Growth plan.** Put devices into deployment phases. A phase table checks everything built up to each phase, you can view the hall as of any phase, and a headroom estimate shows how many more racks fit before power, cooling or ports run out.
- **Failure drill.** Mark a CDU, RPP, in-row cooler or IB switch rack as failed and watch its load move to the nearest working unit. An N+1 check lists every device whose single failure would break the hall.
- **Guided tutorial.** First-time visitors can build a small GB200 hall step by step and learn why it cannot power on until power distribution, cooling and networking are added.
- **Editing.** Drag a device to move it, place a whole row with two clicks, and undo or redo any change (⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y). Delete removes the selected device.
- **Detailed racks without vendor files.** Each device type has its own drawn front: compute and NVLink switch trays and power shelves on NVL72, blades on Kyber, switch ports on the IB rack, drive bays, doors with a display or breakers. Status lights and light bars glow in the rack's family color once the hall is on. To see NVIDIA's own SimReady models of a GB300 rack and a Vertiv CDU, `tools/dsx_overlay.py` swaps them into an exported hall on your own machine ([docs/dsx-assets.md](docs/dsx-assets.md)); their license does not allow putting them on the website.
- **Load you can see.** CDUs and power panels carry a load meter that turns amber near capacity and red when overloaded, and power and coolant flow along the links once the hall is on.
- **Explained assumptions.** "How the model works" explains every check, the PUE formula and its coefficients, what the estimates leave out, and where each device figure comes from.
- **Annual energy.** Enter an electricity price and an average load to see yearly IT and facility energy, the annual PUE and the electricity bill.
- **Ownership estimate.** A deliberately simplified three- or five-year total: hardware, electricity and an optional maintenance assumption, with a band showing how it moves when the price, the average load and the cooling and loss coefficients change. It leaves out the building, the power and cooling plant, networking beyond the racks, staff and the cost of money.
- **Scenarios.** Four short lessons on the same model: why a row of racks cannot power on, the same feed with a newer rack, why one more CDU is not N+1, and a growth plan that fails in phase two. Each ends with what the numbers mean.
- **Start from a goal.** Pick a rack type, a GPU count, a utility feed and optionally N+1, and get a hall that passes every check, with a note on what stopped it short of the goal.
- **Repair suggestions.** When the hall cannot power on, it proposes the fewest support units to add, a bigger utility feed or racks to remove, and applies the fix in one click.
- **Back-end fabric.** For GB300 and Vera Rubin racks, the leaf and spine switches of a Quantum-X800 InfiniBand fat tree (rail-optimized or plain, with a choice of oversubscription), how many IB racks they fill against how many are placed, and a cable bill by class, active copper or single-mode optics, from the rack positions. The power-on check counts one port per GPU; a non-blocking fabric uses about three. Racks NVIDIA connects with Quantum-2 or Ethernet are named and left out.
- **Rack comparison.** For the current utility feed, how many racks of each type fit with just enough support equipment, their GPUs, floor space, PUE and price. The HUD puts the IT load in everyday terms (DGX Sparks, US homes).
- **Works on phones.** The panel folds away to give the 3D view the screen, and a bar on the 3D view shows what a tap will do.
- **Share links.** The layout is encoded in the URL hash, so the address bar always links to the current hall. Shared links show a preview image, and "Save image" downloads the 3D view as a PNG.
- **Architecture report.** One click writes a self-contained HTML report of the current hall: the 3D view, a bill of materials, GPU count, loads, PUE, floor space, hardware and annual energy estimates, bottlenecks, redundancy findings, the assumptions behind the model, the catalog and model versions, and the share link. No server, and it prints to PDF.
- **English and Simplified Chinese UI.**
- **Unity app (macOS, paused).** It reads the same layout through `layout.json` plus glTF models converted from USD.

## Examples

Ready-made halls you can open in the live demo, layout and all. The full set, with the numbers behind each one, is in [docs/examples.md](docs/examples.md).

- **[Small teaching hall](https://datahall-eight.vercel.app/#layout=1,2,gb200:4.3-5.3-6.3-7.3-8.3-9.3-10.3-11.3,cdu:4.5-5.5,ib:6.5-7.5,rpp:8.5-9.5,crah:10.5-11.5).** Eight GB200 racks with just enough power, cooling and network on a 2 MW feed.
- **[A 5 MW Vera Rubin hall](https://datahall-eight.vercel.app/#layout=1,5,vr200:0.2-1.2-2.2-3.2-4.2-5.2-6.2-7.2-8.2-9.2-10.2-11.2-12.2-13.2-14.2-15.2-5.6-6.6-7.6-8.6-9.6,rpp:1.1-8.5-13.1-7.1-4.1-10.1-9.5,cdu:2.1-10.6-14.1-9.1-5.1-6.5,ib:1.3-13.3-7.5-6.1-9.3-11.6,crah:5.3-10.5).** The same exercise one generation later: fewer racks, far more power per rack.
- **[A hall that cannot power on](https://datahall-eight.vercel.app/#layout=1,2,gb200:4.3-5.3-6.3-7.3-8.3-9.3-10.3-11.3).** Racks and nothing else, so the panel can say what is short and offer to fix it.

## Tech stack

| Area | Stack |
| --- | --- |
| Web app | TypeScript 7 (strict), Vite 8, React 19 for the panel, three.js 0.186 for the 3D view (plain three.js, no React bindings) |
| Web tests | vitest for the pure logic, ajv (layout.json schema), Khronos glTF-Validator, Playwright browser smoke tests |
| Hosting | Vercel (production from `main`, preview per pull request), Vercel Web Analytics |
| Provenance | Exported `.usda`, `layout.json` and the architecture report name the catalog data version and the capacity model version behind their figures |
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
| `docs/` | Example hall gallery, SimReady audit report, Unity approach comparison |

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
