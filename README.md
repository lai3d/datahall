# GPU Data Hall Builder

A simulator for laying out an AI data hall around NVIDIA's latest GPU racks: GB200/GB300 NVL72, Vera Rubin NVL72 and Rubin Ultra Kyber. Place racks, power panels, coolant units and network switches on a grid. See whether power distribution, cooling, network ports and utility capacity can carry the load. Then export the hall as OpenUSD.

**Live demo:** https://datahall-eight.vercel.app ([中文界面](https://datahall-eight.vercel.app/?lang=zh))

![A Vera Rubin NVL72 row powered on, with coolant and power links drawn to the CDUs and RPPs](docs/images/web.png)

> Power and price figures are rough estimates from public reports and supply chain sources, not NVIDIA specifications. Use them for learning, not engineering design.

## Features

- **Capacity model.** Five constraints must all hold before the hall can power on: power distribution (RPP), liquid cooling (CDU), air cooling (in-row coolers), back-end network ports and utility power. A simplified PUE estimate is shown alongside.
- **Per-device checks.** Each rack is fed by its nearest CDU and RPP. An overloaded supply blocks power-on even when hall totals are fine. Overloaded supplies and unconnected devices are marked red in 3D.
- **OpenUSD export and import.** The export is Z-up, in meters, and uses instanceable equipment that references catalog prototypes. Parameters are defined by a codeless applied API schema (`dchall:` namespace). The page can re-import its own `.usda` files, including files re-saved by usdview or Omniverse.
- **Share links.** The layout is encoded in the URL hash, so the address bar always links to the current hall.
- **English and Simplified Chinese UI.**
- **Unity app (macOS, paused).** It reads the same layout through `layout.json` plus glTF models converted from USD.

## Repository layout

| Path | Contents |
| --- | --- |
| `web/` | Web app: Vite, three.js, vitest. Deployed to Vercel from `main`. |
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
npm run dev      # dev server
npm test         # vitest
npm run build    # output in web/dist (relative base, deployable under any path)
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

- **web job:** vitest and the production build
- **usd-tools job:** schema freshness, sample validation and the Python tests

Unity isn't built in CI.

## Contributing notes

Design decisions and conventions live in [CLAUDE.md](CLAUDE.md), written in Chinese. It covers the coordinate system, schema versioning, share-link format and data sourcing rules. When changing power or price figures in `spec/catalog.json`, cite the source in the item's note.
