# Real equipment models on your own machine (NVIDIA DSX assets)

The web app draws its racks procedurally (`web/src/rack-faces.ts`): an illustrative front for each device type, no vendor files. If you want to see a hall with real equipment models, `tools/dsx_overlay.py` swaps SimReady assets into a hall you exported, **locally**. Nothing from NVIDIA is copied into this repository or published on the website.

## Why only locally

The assets come from the NVIDIA Omniverse DSX Blueprint content pack ([SimReady Assets for DSX Digital Twins](https://docs.omniverse.nvidia.com/dsx/latest/simready-assets.html) documents a DGX GB300 NVL72 rack and a Vertiv XDU2300 coolant distribution unit). The pack is licensed under the **NVIDIA Sample Data License for Evaluation** (v. Jan. 16, 2026): use and modification are allowed internally and solely to evaluate NVIDIA technologies (section 1), and distributing it or its derivative works, or otherwise making them available to others, is not (section 2(c)). A web page hands its 3D models to every visitor, so the pack cannot go on the website, and a converted or simplified copy counts as a derivative work. Viewing your own hall with the assets in usdview or Omniverse on your machine is the evaluation use the license allows. Read the license yourself before downloading; this note is not legal advice.

## Steps

1. **Download the content pack** from the NGC catalog: [Omniverse DSX Blueprint for AI Factories](https://catalog.ngc.nvidia.com/orgs/nvidia/omniverse/resources/dsx_dataset/-) (about 33 GB compressed; NGC CLI or the Download button). Accept the license. Keep it outside the repository, or in `dsx/` at the repository root, which is ignored by git.
2. **Find the asset files.** Each asset has a main `.usd` file with metadata layers and geometry payloads beside it. Pick the main file of the GB300 NVL72 rack and of the XDU2300 CDU.
3. **Export a hall** from the web app ("Export OpenUSD"), with GB300 racks and CDUs in it.
4. **Write the overlay:**

   ```bash
   python3 -m venv .venv && .venv/bin/pip install usd-core
   .venv/bin/python tools/dsx_overlay.py datahall.usda \
       --asset gb300=/path/to/GB300_NVL72.usd \
       --asset cdu=/path/to/XDU2300.usd
   ```

   This writes `datahall_dsx.usda` next to the hall. It sublayers the hall, turns off the simplified geometry of each swapped type and references the asset in its place. Paths are relative, so keep the files where they are or move them together.
5. **Check the printed footprint.** The script prints each swapped type's size in the hall against the 0.6 × 1.2 m grid cell. The overlay assumes the AI Factory asset convention (Z up, meters, front facing +X) and rotates -90° so the front faces the hall's -Y. If a type comes out wider than deep, try `--rotate 0`, `90` or `180`. Other units and Y-up assets are converted from the asset's own `metersPerUnit` and `upAxis`. A real CDU can be larger than one cell; the script warns, since the grid does not model multi-cell devices.
6. **Open it:** `usdview datahall_dsx.usda` (set `PXR_PLUGINPATH_NAME=$PWD/schema` to see the `dchall:` attributes), or open it in Omniverse. `tools/usd_to_unity.py datahall_dsx.usda -o bundle` also converts it for the Unity app, since the converter composes the overrides; MDL materials fall back to their display color there.

Do not commit the overlay's output bundle or anything converted from the assets (`*_dsx.usda` files are ignored by git as well).

## How the overlay works

It is approach B from [simready-audit.md](simready-audit.md#swapping-in-high-fidelity-models): an `over` on the catalog prototype `/DataHall/Catalog/<id>` deactivates `Body` and `Front` and adds a child Xform `simready_model` with `kind = "subcomponent"` that references the asset and carries the rotation. Every placed instance references the prototype, so they all follow. `tools/test_dsx_overlay.py` checks this with stand-in assets built to the same convention, no NVIDIA files needed.
