# Roadmap (2026 Q4)

中文版：[roadmap.zh.md](roadmap.zh.md). Both versions carry the same content; change them together.

Written 2026-09-17. Positioning: **a demo for spreading and teaching data hall capacity logic**. Planned through mid-December 2026; the next quarter is planned after that.

Estimates are in Claude session hours. Calendar time depends on how sessions are scheduled. Work that a person has to do by hand is listed separately at the end.

## Goal and measures

- **Goal**: a stranger opens the link, understands within 5 minutes why an AI data hall "cannot power on", and wants to pass the link along.
- **Measures**: visits, share of visitors who finish a scenario, and how often a `#layout=` share link is opened. Visits and share-link opens are measured with Vercel Web Analytics from 2026-09-17 (share-link visits show up as the page `/shared`); scenario completion is not measured yet.
- **Not this quarter**: real network topology (the IB switch rack stays a simplified 288-port model), user-editable device parameters, the Unity app.

## Now (next 2 to 4 sessions)

| Item | Why | Estimate | Status |
| --- | --- | --- | --- |
| Migrate JS to TS (strict) | Everything that follows is built on TS | — | Done, 2026-09-17 |
| English docs and code comments | Docs and comments default to English from 2026-09-17. CLAUDE.md, docs/ and all code comments are converted; UI copy, catalog data and asserted Chinese output stay Chinese | 2–3 h | Done, 2026-09-17 |
| Fix the 3 bugs from the 2026-09-17 review | Nearest-supply ties resolve by placement order and dragging changes that order, so an identical layout can "mysteriously" overload and the result travels with share links; a corrupt localStorage entry keeps the page from loading; the share-link phase cap does not match the UI | 1 h | Not started |
| Guided scenario (tutorial mode) | New users open the page and do not know what to do. "Place 8 racks → why it cannot power on → add a CDU → power on" is the teaching storyline | 4–6 h | Not started |
| Social preview image and one-click screenshot | Spreading depends on links, and links need an image. One OG image; export the 3D view as PNG (`toDataURL` after `renderOnce` already works) | 1–2 h | Not started |
| Vercel Web Analytics | Without measurement there is no way to know whether anyone uses it | 0.5 h | Done, 2026-09-17 |
| AMD racks in the catalog | Helios (72 MI455X) and an MI355X DLC rack as catalog entries only; the model is vendor-neutral and the comparison story needs a second vendor | 1 h | Done, 2026-09-17 |
| Playwright smoke test in CI | The 3D view and panel had no automated tests; it is also the safety net for the React migration and tutorial mode | 2 h | Done, 2026-09-17 |
| Migrate the panel to React | Tutorial mode, the "Learn more" panel, comparison cards and the collapsible mobile panel are all UI work; move the hand-written DOM panel to React first so that code is not rewritten twice. The 3D scene stays plain three.js | 2–3 h | Done, 2026-09-17 |

## Next (mid-quarter, 1 to 2 months)

| Item | Why | Estimate |
| --- | --- | --- |
| "Learn more" panel | A paragraph and source link for each device type and each constraint; why the PUE coefficients are 0.08 and 0.30 | 2–3 h |
| Scenario comparison cards and scale reference | At the same utility feed, how many GB200, Rubin, Helios and Kyber racks fit and what PUE results. The density trend is the best story to tell. Also a scale reference next to the IT load in the HUD: the hall's load in DGX Sparks (about 240 W), Mac Studios (about 270 W) and average households, so personal-scale readers get a feel for it. Personal devices are not placeable equipment: they are three orders of magnitude below a rack and never touch a constraint | 4–5 h |
| Load visualization | Animated flow on links after power-on; CDUs and RPPs colored by load, so "nearest assignment" becomes visible | 2–3 h |
| Annual electricity cost | One electricity price input; convert facility kW into money | 1 h |
| Mobile polish | Collapsible panel, placement feedback on touch. Most share links are opened on phones | 2 h |
| Catalog data refresh | Measured GB300 power after shipping, Rubin's official naming, Kyber figures re-checked, DGX B200 replaced by B300; add Huawei CloudMatrix 384 as a compute rack (32 Ascend 910C) plus an optical switch rack, the best contrast story to NVL72; TPU Ironwood only if a credible per-rack power figure appears. Before adding any air-cooled dense rack, turn the hardcoded `dgx` density warning in `sim.ts` into a catalog flag. Sources go into the `catalog.json` notes | 2 h |

## Later (after the quarter, directional)

- Multi-cell footprints: AMD Helios is a 1.2 m wide Open Rack Wide but occupies one 0.6 m cell today; supporting 2-cell devices touches placement, drag, share links, USD and layout.json.
- Embed mode `?embed`: hide the panel, keep the 3D view and one sentence, for embedding in articles.
- A third UI language (Japanese or Korean), decided by where visitors come from.
- USD: maintain compatibility only; no usdc or real SimReady assets unless someone on the Omniverse side wants to integrate.
- Unity app stays paused (see `docs/unity-options.md`) unless an on-site showcase or VR need appears.

## Risks and dependencies

- **Tutorial mode touches most of `main.ts` and the React panel**: build it first, then load visualization and comparison cards, to avoid changing the same code twice.
- **Data credibility is the weak spot for spreading**: being called out for a wrong number hurts more than a missing feature. Every new rack figure needs a source (see the data credibility section in `CLAUDE.md`).
- **Parallel sessions**: check branches before editing `web/src`, and keep feature items from overlapping files.

## Manual work (duration outside Claude's control)

- Record a GIF or short video.
- Pick distribution channels (HN, X, Zhihu, WeChat) and write the launch copy.
- Review analytics before deciding on the language and embed-mode items in Later.
