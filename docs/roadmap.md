# Roadmap (2026 Q4)

中文版：[roadmap.zh.md](roadmap.zh.md). Both versions carry the same content; change them together.

Written 2026-09-17, re-planned 2026-09-20 after the Now and Next lists were emptied. Positioning: **a demo for spreading and teaching data hall capacity logic**. Planned through mid-December 2026; the next quarter is planned after that.

Estimates are in Claude session hours. Calendar time depends on how sessions are scheduled. Work that a person has to do by hand is listed separately at the end.
Items marked P0–P4 come from [product-roadmap-proposal.md](product-roadmap-proposal.md), which stays the longer-term material.

## Goal and measures

- **Goal**: a stranger opens the link, understands within 5 minutes why an AI data hall "cannot power on", and wants to pass the link along.
- **Measures**: visits, share of visitors who finish a scenario, and how often a `#layout=` share link is opened. All three are measured with Vercel Web Analytics from 2026-09-17: share-link visits show up as the page `/shared`, finishing the guided tutorial as `/tutorial-done`, and finishing a scenario as `/scenario-<id>-done` (compare with visits to `/`).
- **Not this quarter**: Ethernet, front-end and storage networks, network congestion, user-editable device parameters, the Unity app. The back-end fabric covers Quantum-X800 InfiniBand only, and the power-on check keeps its port count.

## Now (next 2 to 4 sessions)

| Item | Why | Estimate | Status |
| --- | --- | --- | --- |

## Next (mid-quarter, 1 to 2 months)

| Item | Why | Estimate |
| --- | --- | --- |

## Later (after the quarter, directional)

- Deeper infrastructure models (P4), one at a time and only after the teaching work: the power chain (transformer, switchgear, UPS, A/B feeds, 2N), liquid cooling loops (facility and technology loops, supply and return temperatures, flow), and the rest of the back-end fabric: a switch and link failure drill with N+1, leaf and spine links in the 3D view, and carrying the fabric through layout.json, USD, share links and the growth plan.
- Multi-cell footprints: AMD Helios is a 1.2 m wide Open Rack Wide but occupies one 0.6 m cell today; supporting 2-cell devices touches placement, drag, share links, USD and layout.json.
- Embed mode `?embed`: hide the panel, keep the 3D view and one sentence, for embedding in articles.
- A third UI language (Japanese or Korean), decided by where visitors come from.
- USD: maintain compatibility only; no usdc or real SimReady assets unless someone on the Omniverse side wants to integrate.
- Unity app stays paused (see `docs/unity-options.md`) unless an on-site showcase or VR need appears.
- Accounts, cloud saves and collaboration stay off the list until share links, local snapshots and exports show a real limitation.

## Shipped

Dates are when the work merged to main.

**Teaching**
- ✅ Guided tutorial: place 8 racks, see why they cannot power on, add the support, power on (2026-09-17).
- ✅ Scenario library: four short lessons with a goal, a starting hall, a completion condition and a conclusion (2026-09-18).
- ✅ Methodology dialog: the five checks, the per-device check, the PUE formula and its coefficients, prices and energy, the limits of the planning estimates, and every catalog note (2026-09-18).
- ✅ Rack comparison cards and a scale reference in the HUD (DGX Sparks, US homes) (2026-09-17).

**Planning**
- ✅ Compare two designs (P3): pin a hall, change it, and see GPUs, power, PUE, hardware, energy, cost, the power-on check and redundancy side by side with the change marked; swap to edit the pinned one, or pin a hall from a share link. Local only, no accounts (2026-09-22).
- ✅ Repair suggestions: what to add, a bigger feed or which racks to remove, each option re-checked and applied in one click (2026-09-18).
- ✅ Layout from a goal: rack type, GPU count, feed and optional N+1 give a hall that passes, with the reason when the goal does not fit (2026-09-18).
- ✅ Annual energy and electricity cost, with an average-load input (2026-09-18).
- ✅ Simplified three- or five-year ownership estimate: hardware, electricity and an optional maintenance assumption, with a sensitivity band on price, average load and the cooling and loss coefficients (2026-09-20).
- ✅ Back-end fabric on Quantum-X800 InfiniBand: leaf and spine switches for GB300 and Vera Rubin (two planes), rail-optimized or plain, with an oversubscription choice, IB racks needed against placed, and a cable bill by class from rack positions. Leaf and spine counts match NVIDIA's DGX SuperPOD reference designs; racks NVIDIA pairs with Quantum-2 or Ethernet say so and are left out (2026-09-21).
- ✅ Load visualization: load meters on CDUs and RPPs, and flow along the links while powered on (2026-09-17).

**Credibility**
- ✅ Sources for every catalog figure (official / reported / estimate, with ranges and checked dates), shown in the app; all values re-checked (2026-09-18).
- ✅ Huawei CloudMatrix 384 as a compute rack, the contrast to NVL72 (2026-09-18).
- ✅ Versioned exports: `.usda` and `layout.json` name the catalog data version and the model version; imports flag a different catalog (2026-09-18).

**Reach and craft**
- ✅ Panel groups: the builder (feed, devices, checks, details) stays on top, and the rest sits in three tabs, Learn (scenarios, examples, rack comparison), Design (goal, growth plan, energy and cost, back-end fabric) and Drill (failure drill, N+1); a scenario opens the tab with the tools it needs (2026-09-22).
- ✅ Cold load: three.js loads after the panel (first paint 820–976 ms → about 350 ms on a throttled profile) and fingerprinted assets carry an immutable cache header (2026-09-20).
- ✅ Keyboard and screen reader access: a keyboard cursor places, selects and moves devices in the 3D view, the panel is the main landmark, the capacity verdict is announced, and the two light-theme colors below 4.5:1 are fixed (2026-09-20).
- ✅ Example gallery: six halls kept in the repo as share links, generated into `docs/examples.md`, each checked against what it claims (2026-09-20).
- ✅ TypeScript (strict) migration, React panel, Playwright smoke tests in CI, English docs and comments (2026-09-17).
- ✅ Detailed device models: a drawn front per device type (trays, power shelves, ports, drive bays, doors) with glowing status lights, and a local-only overlay that swaps NVIDIA's DSX SimReady assets into an exported hall for usdview or Omniverse (2026-09-21).
- ✅ "Inside the rack" in the device details: compute trays, NVLink switch trays, power shelves, servers or switches as the maker documents them, with sources; the 3D front draws the same counts, and racks without a published layout say theirs is illustrative (2026-09-22).
- ✅ Social preview image, favicon, one-click screenshot of the 3D view (2026-09-17).
- ✅ Mobile polish: foldable panel, stage bar, placement feedback (2026-09-17).
- ✅ Architecture report export: one self-contained HTML file with the screenshot, bill of materials, checks, redundancy findings, energy estimate, assumptions, versions and the share link (2026-09-20).
- ✅ Vercel Web Analytics with no layout content sent (2026-09-17).
- ✅ AMD Helios and MI355X racks in the catalog (2026-09-17).
- ✅ Review fixes: the three bugs from the 2026-09-17 review, and eight defects plus the smaller items from the 2026-09-18 review (order-dependent capacity checks, prototype device types, tutorial and scenario completion, repair suggestions around manual assignments and phases) (2026-09-17 and 2026-09-18).

## Risks and dependencies

- **The panel keeps growing**: ten sections is already a lot for a first visit. Group them before adding the design comparison.
- **Data credibility is the weak spot for spreading**: being called out for a wrong number hurts more than a missing feature. Every new figure needs a source, and `checked` dates go stale (see the data reliability section in `CLAUDE.md`).
- **Cost modelling invites false precision**: the ownership estimate has to keep saying what it leaves out, the way the energy estimate does.
- **Parallel sessions**: check branches before editing `web/src`, and keep feature items from overlapping files.

## Manual work (duration outside Claude's control)

- Record a GIF or short video. The material is ready: scenarios, one-click repair, layout from a goal, and the flow along the links.
- Pick distribution channels (HN, X, Zhihu, WeChat) and write the launch copy.
- Review analytics after a meaningful period before deciding on the language and embed-mode items in Later.
