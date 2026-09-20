# Launch copy

Draft material for launching the web app (https://datahall-eight.vercel.app, repo https://github.com/lai3d/datahall).
Written 2026-09-20 against catalog version `2026-09-18` and model version `1.0`. Every number traces to the facts sheet at the
bottom; if the catalog or the model changes, re-run the checks there before posting.

The copy in each section is in the language of that channel. Edit freely — this is a starting point, not a script.

## 1. Hacker News

**Title** (69 characters)

```
Show HN: Place GPU racks in a data hall and see why it can't power on
```

**First comment** (200 words)

```
I kept reading about AI data centers measured in megawatts instead of racks, and wanted to see
where the megawatts go. So: put GPU racks on a 16x10 floor grid, and the hall refuses to power on
until five checks pass — power distribution, liquid cooling, air cooling, back-end network ports
and the utility feed. A sixth check is per device: each rack draws from its nearest CDU and RPP, so
a hall whose totals add up can still fail on one overloaded unit.

What it deliberately simplifies: PUE is a teaching formula (liquid heat x 0.08 + air heat x 0.30 +
IT x 0.05, plus equipment overhead), the network is a port count, not a topology, and GPUs are
counted, never benchmarked — 2 MW buys 864 GPUs as 12 GB200 racks or 576 as 8 Vera Rubin racks,
which says nothing about throughput.

Every figure sits in one catalog file with sources tagged official, reported or estimate, the range
they give and when it was last checked. NVIDIA publishes no Vera Rubin rack power, so 190 kW is a
reported Max-Q figure; support gear prices are my own estimates. Corrections to the numbers are
more useful to me than feature requests.
```

## 2. X / Twitter

Thread of five posts. Post 1 stands alone. One hashtag at the end, or none.

**1** (260 characters) — attach the GIF: a row of 8 GB200 racks appears, four red reasons show up in the panel,
then an RPP, a CDU, an in-row cooler and an IB rack go in and the hall powers on with flow dots along the links.

```
An AI data hall is quoted in megawatts, not racks. I built a browser simulator to show why: drop
GB200 or Vera Rubin racks on a floor grid and the hall stays dark until power, cooling, network and
the utility feed all add up.

https://datahall-eight.vercel.app
```

**2** (211 characters)

```
Eight GB200 racks on their own: 1.00 MW to distribute, 850 kW of liquid heat, 150 kW of air heat,
576 GPUs and zero network ports. Four reasons the hall can't power on, and each one names the unit
that fixes it.
```

**3** (242 characters) — attach a screenshot of the rack comparison section.

```
Same 2 MW feed, two halls: 12 GB200 racks give 864 GPUs over 22 floor cells; 8 Vera Rubin NVL72
racks give 576 GPUs over 15. Newer racks mean fewer GPUs per megawatt and less floor per megawatt.
The sim counts GPUs, it doesn't benchmark them.
```

**4** (254 characters) — attach a short clip of the failure drill: mark a CDU failed, its load moves, the N+1 list fills up.

```
Totals aren't the whole story. Every rack is fed by its nearest CDU and RPP, so a hall that passes
on paper can fail per device. Mark a unit failed and watch its load move to the neighbour; the N+1
check lists every device whose loss would stop the hall.
```

**5** (276 characters) — attach a screenshot of the methodology dialog showing the sources list.

```
Caveat worth stating plainly: the power and price figures are public estimates, not vendor specs.
Each one carries its sources, the range they give and when it was last checked. NVIDIA publishes no
Vera Rubin rack power at all.

MIT, exports OpenUSD: github.com/lai3d/datahall
```

## 3. Zhihu (知乎)

**标题**

```
一个机房为什么“上不了电”：我写了个浏览器里的 AI 机房布局模拟器
```

**正文**（约 580 字）

```
AI 数据中心现在都用兆瓦而不是机柜数来描述规模。我想把这件事做成可以动手摆的东西，于是写了这个浏览器里的模拟器。

你在一个 16×10 的地面网格上摆机柜。摆完 GPU 机柜之后，机房是通不了电的——要同时满足五项检查：配电容量、液冷容量、
风冷容量、后端网络端口数，以及市电进线。任何一项不够，面板就会写明缺多少、该补哪种设备。比如 8 台 GB200 NVL72
单独摆在地上，就是 1.00 MW 需要配电、850 kW 液冷热量、150 kW 风冷热量、576 张 GPU 和 0 个网络端口，四条理由一起列出来。

还有第六项检查是按设备算的：每台机柜接最近的 CDU 和配电柜，所以总量够了、但某一台 CDU 被压满，机房同样上不了电。
总账和单机账是两件事。

密度这件事也可以直接比。同样一路 2 MW 的市电：12 台 GB200 能跑 864 张 GPU，占 22 个地面格；换成 8 台
Vera Rubin NVL72，只有 576 张 GPU，但只占 15 个格。越新的机柜，同样电力下 GPU 数量更少、占地更小。
需要说明：模拟器只数 GPU 数量，不建模单卡算力，这个对比不代表算力高低。

里面的功率和价格都是公开资料的估算，不是厂商规格：每个数字都带来源（官方文档、媒体报道或我自己的估算）、来源给出的区间
和最后核对日期。英伟达并没有公布 Vera Rubin 的整柜功率，190 kW 用的是分析师的 Max-Q 口径。

地址：https://datahall-eight.vercel.app （代码 MIT：https://github.com/lai3d/datahall）
欢迎挑数字上的错，比提功能有用。
```

## 4. Facts sheet

Everything the copy above claims, with where it comes from. Re-verify after a catalog or model change.

**The model**

| Fact | Value | Source |
| --- | --- | --- |
| Checks that block power-on | power distribution (RPP), liquid cooling (CDU), air cooling (in-row coolers), back-end network ports, utility feed | `web/src/sim.ts` `compute()` |
| Per-device check | each device is assigned to its nearest CDU / RPP (cross-row distance doubled); an overloaded unit blocks power-on even when totals pass | `web/src/supply.ts`, `web/src/grid.ts` `supplyLinks` |
| PUE formula | `(IT + equipment overhead + liquid heat × 0.08 + air heat × 0.30 + IT × 0.05) / IT` | `sim.ts` `PUE_FACTORS = {liquid: .08, air: .30, losses: .05}` |
| Grid | 16 columns × 10 rows = 160 cells, each 0.6 m × 1.2 m (0.72 m²) | `web/src/grid.ts` `GRID` |
| Utility feeds offered | 2, 5, 10 MW | `sim.ts` `UTILITY_OPTIONS` |
| Model version / catalog version | 1.0 / 2026-09-18 | `sim.ts` `MODEL_VERSION`, `spec/catalog.json` `version` |

**Catalog figures used in the copy** (`spec/catalog.json`)

| Device | Value | Provenance |
| --- | --- | --- |
| GB200 NVL72 | 72 GPUs, 125 kW, 85% liquid, ~$3.0M | kW from NVIDIA OCP contribution blog and Vertiv, range 120–132 kW; price reported (Wolfe Research via Investing.com, 2026-01-30) |
| Vera Rubin NVL72 | 72 GPUs, 190 kW, 100% liquid, ~$6.0M | NVIDIA publishes no rack power; 190 kW is Ming-Chi Kuo's Max-Q figure (reported, 2026-01-06), range 190–230 kW; price $5–7M (Tom's Hardware, 2026-03-24) |
| CDU | 800 kW liquid cooling, 12 kW overhead | Vertiv CoolChip range 600–2300 kW; the 800 kW point and the overhead are this project's estimate |
| In-row cooler | 120 kW air cooling, 9 kW overhead | stands in for about two real units (Vertiv CRV, Schneider ACRC600); this project's estimate |
| RPP | 800 kW distribution | Hyper RPP product page; 800 kW ≈ 1200 A at 415 V is this project's estimate |
| IB switch rack | 288 ports, 24 kW | NVIDIA Q34xx specs; the 288-port / 24 kW rack is this project's estimate for about two Q3400 switches |

**Eight bare GB200 racks** (the tutorial and the `powerOn` scenario starting hall, 2 MW feed)

- 1.00 MW needing distribution, 0 kW available
- 850 kW liquid heat, 0 kW available
- 150 kW air heat, 0 kW available
- 576 GPUs, 0 ports

Verified by running `SCENARIOS.powerOn.start()` through `compute()`; the four issue strings come from `sim.ts`.

**Density comparison at 2 MW** (`compare.ts` `largestHall`, hall-wide totals only)

| Rack | Racks | GPUs | IT load | Facility load | PUE | Floor cells (racks + support) | Hardware estimate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GB200 NVL72 | 12 | 864 | 1572 kW | 1893 kW | 1.20 | 22 (12 + 10) = 15.8 m² | $40.1M |
| GB300 NVL72 | 11 | 792 | 1612 kW | 1913 kW | 1.19 | 21 | $51.6M |
| Vera Rubin NVL72 | 8 | 576 | 1568 kW | 1815 kW | 1.16 | 15 (8 + 7) = 10.8 m² | $51.1M |
| AMD Helios | 7 | 504 | 1693 kW | 1969 kW | 1.16 | 16 | $40.4M |
| Kyber NVL144 | 2 | 288 | 1224 kW | 1421 kW | 1.16 | 8 | $19.8M |
| CloudMatrix 384 rack | 32 | 1024 | 1600 kW | 1997 kW | 1.25 | 45 | $26.6M |

Floor area counts device cells only (0.72 m² each), not aisles, walls or plant rooms. "Start from a goal" with the same
inputs produces the same rack counts (12 GB200 / 8 Vera Rubin at 2 MW), so the two features agree.

**Energy** (`energy.ts`, defaults)

- Default electricity price 8.62 ¢/kWh — 2025 US industrial average, US EIA Electric Power Monthly table 5.3; excludes taxes, demand charges and fixed fees.
- Default average load 80% of rated IT power — an assumption, not a measurement.
- 8760 hours per year.
- The 2 MW GB200 hall above: 13,353 MWh a year, annual PUE 1.21, about $1.15M of electricity at the defaults.
- The 2 MW Vera Rubin hall: 12,780 MWh, annual PUE 1.16, about $1.10M.
- Annual PUE is higher than the instantaneous PUE because equipment overhead runs all year while IT, cooling and losses follow the average load.

**Context figure available but not used in the copy**

- Uptime Institute Global Data Center Survey 2025: weighted average annual PUE 1.54, and 1.44 for facilities of 20 MW and above. It appears in the methodology dialog. Do not put it next to this model's ~1.2 in a post: that number is a measured annual average across real sites, this one is a design-point estimate at full load, and comparing them implies an accuracy the model does not have.

**Features that exist and can be shown** (all in `docs/roadmap.md` under Shipped)

Guided tutorial, four scenarios, repair suggestions with a one-click apply, layout from a goal (rack type, GPU count, feed, optional N+1),
growth phases with a per-phase check, failure drills and an N+1 list, annual energy, rack comparison, methodology dialog with every source,
share links in the URL hash, PNG snapshot, OpenUSD `.usda` export and import, `layout.json` export, English and Simplified Chinese UI.

## 5. What not to claim

- **Not vendor specifications.** The figures are public estimates assembled for teaching: vendor documents where they exist, press and analyst reports otherwise, and this project's own reasoning for the rest. Never present a catalog number as a spec. Vera Rubin rack power in particular is unpublished by NVIDIA.
- **Prices are estimates.** Rack prices come from press and analyst reports with wide ranges; every support unit price (CDU, RPP, in-row cooler, IB rack) is this project's own estimate. No price is official.
- **The network model is a port count.** One IB rack is 288 ports; there is no leaf/spine topology, no oversubscription, no cable lengths. "Enough ports" is not "the network works".
- **Per-GPU performance is not modeled.** Fewer GPUs per megawatt on a newer rack is not a statement about throughput, tokens or training time. Do not turn the density comparison into a performance comparison.
- **PUE is a teaching formula, not a facility model.** Three coefficients and an equipment overhead term; no climate, no free cooling, no water, no part-load curves for chillers, no seasonal variation. The numbers it produces are not comparable to a measured annual PUE.
- **The rack comparison and the headroom estimate are totals only.** They ignore free floor cells and which CDU or RPP each rack connects to, so a hall they call possible can still fail the per-device check once it is laid out. The app says this in the section itself; say it in the copy too.
- **N+1 uses the same nearest assignment as everything else.** The check fails one facility at a time and reassigns its load to the nearest surviving unit. It is not a redundancy design: no A/B power paths, no 2N, no concurrent maintainability, no simultaneous failures.
- **One floor, one shape.** A fixed 16×10 grid of 0.6 m × 1.2 m cells, one device per cell, no multi-cell footprints (AMD Helios is an Open Rack Wide in reality), no aisles, no walls, no containment, no room height.
- **No claims of being first, unique, or the only tool of its kind**, and no benchmark or accuracy claims of any sort.
- **The Unity app is paused.** It exists in the repo as a macOS build, it is not part of what is being launched.
- **Not affiliated with NVIDIA, AMD or Huawei.** Trademarks are used only to describe the equipment being simulated, as the README states.
