# Product Roadmap Proposal

This document is a proposal for what should follow the current 2026 Q4 roadmap. It is intentionally separate from `roadmap.md`: the existing roadmap remains the committed plan, while this document is material for review and prioritization.

## Product direction

DataHall has moved beyond proving that an interactive 3D builder can work. It now has a tutorial, capacity checks, growth phases, failure drills, rack comparisons, share links, screenshots, OpenUSD interchange, mobile support, analytics, and automated tests.

The next phase should not be driven by the number of devices or controls. It should make DataHall:

1. a teaching product that helps a new visitor understand AI data-hall constraints quickly; and
2. a credible technical portfolio project for AI infrastructure, GPU platforms, data-centre architecture, and digital twins.

The proposed positioning is:

> An explainable AI data-hall teaching and early-planning simulator, with explicit assumptions and auditable source data.

It must remain clear that the simulator is educational and is not a substitute for engineering design.

## Product principles

Use these questions to decide whether a feature belongs on the roadmap:

1. Does it help a stranger understand an AI data-hall concept more quickly?
2. Does it make a result more credible, explainable, or reproducible?
3. Does it demonstrate meaningful AI-infrastructure or platform-architecture ability?

Defer features that satisfy none of these questions.

Additional principles:

- Prefer better explanations and stronger evidence over more device models.
- Preserve a simple first-run experience; expose engineering depth progressively.
- Show uncertainty rather than presenting estimates as specifications.
- Keep calculations deterministic and testable.
- Avoid false precision in cost, cooling, reliability, and sustainability models.
- Treat exported results as versioned records: they should identify their model, catalog, and assumptions.

## Information architecture

The current panel already contains a large amount of functionality. Before adding several more sections, organize the experience conceptually into three modes. These do not need to become separate pages immediately.

### Learn

For first-time and non-specialist visitors:

- guided tutorial;
- device and constraint explanations;
- sourced comparison cards;
- story-based scenarios;
- short conclusions explaining why a design succeeds or fails.

### Design

For capacity exploration:

- target GPU count or rack count;
- utility-power limit;
- redundancy target;
- deployment phases;
- generated starting layout;
- energy, cost, floor-space, and bottleneck summaries;
- comparison between two user layouts.

### Drill

For reliability education:

- CDU, RPP, cooling, network, and utility failures;
- load transfer visualization;
- N+1 and, later, 2N checks;
- recovery suggestions and before/after summaries.

Progressive disclosure is important. Advanced power, cooling, and network models should not make the introductory builder harder to understand.

## Proposed priorities

### P0 — Data credibility and methodology

#### 1. Add source metadata and uncertainty to the catalog

Each material equipment figure should be able to carry:

- source URL and title;
- publication/source date;
- date last checked;
- whether the source is official, reported, inferred, or estimated;
- confidence level;
- assumption or configuration, such as Max-Q;
- an optional range in addition to the selected simulation value.

Example UI:

```text
Vera Rubin NVL72
Simulation value: 190 kW
Reported range: 190–230 kW
Basis: Max-Q configuration
Confidence: medium
Checked: 17 Sep 2026
```

A possible catalog shape is:

```json
{
  "sourceUrl": "https://example.com/source",
  "sourceTitle": "Source title",
  "sourceDate": "2026-01-01",
  "checkedAt": "2026-09-17",
  "sourceType": "reported",
  "confidence": "medium",
  "range": { "min": 190, "max": 230 },
  "assumption": "Max-Q configuration"
}
```

The exact schema needs design review. Do not add fields merely for completeness if they cannot be presented or maintained consistently.

#### 2. Add a methodology and assumptions view

Explain:

- the simplified PUE formula and its coefficients;
- what the capacity model includes and excludes;
- how equipment prices are estimated;
- why rack comparisons do not model per-GPU performance;
- why hall-wide headroom can differ from per-device supply checks;
- which results must not be used for engineering design.

This should be accessible from the application, not only from the repository.

#### 3. Version exported results

Exports and generated reports should identify:

- catalog version;
- simulation/model version;
- generation timestamp;
- selected assumptions.

The goal is to make a shared or exported result explainable after catalog values change. The versioning approach must preserve existing share links and import compatibility.

### P1 — Explainability and teaching scenarios

#### 4. Turn failure messages into repair suggestions

In addition to saying why a hall cannot power on, propose small corrective actions, for example:

```text
Minimum additions:
- 1 CDU
- 1 RPP
- 1 InfiniBand switch rack

Alternative:
- remove 2 GB200 racks
```

Start with deterministic enumeration of a limited set of support-equipment changes. Do not begin with a general optimizer.

Suggestions must state whether they use hall-wide totals only. A totals-based suggestion can still fail because of placement or per-device assignment, so the application must re-run the full checks before describing a proposal as valid.

Potential optimization objectives, introduced one at a time:

- fewest added units;
- lowest estimated equipment cost;
- least additional floor space.

#### 5. Build a scenario library

Presets should evolve into small lessons with a goal, starting state, completion condition, and conclusion.

Suggested scenarios:

1. **Why eight GPU racks cannot power on** — the existing tutorial story.
2. **GB200 versus Rubin under the same 2 MW feed** — compare rack count, GPU count, floor space, cooling, PUE, hardware estimate, and energy.
3. **One extra CDU does not make a hall N+1** — reveal remaining RPP or network single points of failure.
4. **A three-phase expansion that fails in phase two** — use the existing growth model.
5. **Why denser racks do not make the facility problem disappear** — compare Rubin or Kyber with earlier racks.

Each scenario should produce a shareable final state. Completion should be measurable without sending layout contents to analytics.

#### 6. Generate a feasible starting layout

Accept a small set of goals:

- target GPU count or compute-rack count;
- rack family;
- utility-power limit;
- optional N+1 requirement;
- optional number of deployment phases.

Generate a deterministic initial layout with enough supporting equipment, then let the user edit it. A first version can target one known layout pattern rather than solving arbitrary floor planning.

The generator should return an explanation of what it added and what constraint limits further growth.

### P2 — Energy and economic model

#### 7. Expand annual electricity cost beyond one multiplication

Inputs and outputs should include:

- electricity price per kWh;
- average utilization or load factor;
- annual IT energy;
- annual facility overhead energy;
- annual total energy;
- annual electricity cost.

Any regional presets must cite a source and explain whether taxes, demand charges, or industrial tariffs are excluded.

#### 8. Add a simplified ownership estimate

After the annual-energy model is stable, add an explicitly simplified three- or five-year estimate:

- equipment capital estimate;
- electricity;
- optional maintenance assumption;
- total.

Sensitivity is more useful than false precision. Show how the estimate changes with electricity price, utilization, and PUE.

Carbon intensity and WUE should remain later items until their assumptions and sources can be represented credibly.

### P3 — Professional output

#### 9. Generate an architecture report

Export an HTML or PDF report containing:

- scenario name and timestamp;
- screenshot;
- bill of materials;
- GPU count, IT load, facility load, and PUE;
- floor-space summary;
- hardware and annual-energy estimates;
- bottlenecks and redundancy findings;
- assumptions, source status, and model/catalog versions;
- share link and OpenUSD export reference.

This would turn an interactive experiment into an auditable artifact useful for teaching, demonstrations, and portfolio reviews.

#### 10. Compare two user designs

The existing rack comparison calculates theoretical halls. A separate design comparison should compare two saved layouts on:

- equipment and GPU counts;
- IT and facility power;
- floor cells;
- PUE;
- hardware estimate;
- annual energy cost;
- bottlenecks;
- single points of failure.

Avoid adding accounts or a backend initially. Two local snapshots or imported layouts are sufficient.

#### 11. Add a curated example gallery

Maintain selected examples as repository-owned share links or fixtures:

- small teaching hall;
- 1 MW GB200 hall;
- 2 MW Rubin hall;
- N+1 design;
- three-phase growth plan;
- intentionally broken design.

Use them in the README, application, launch material, and demonstrations. Do not build user accounts, comments, or cloud persistence without evidence that collaboration is needed.

### P4 — Deeper infrastructure modelling

These items add strong AI-infrastructure depth but should follow the credibility and teaching work.

#### 12. Expand the power chain

Move optionally from:

```text
Utility → RPP → rack
```

toward:

```text
Utility → transformer → switchgear → UPS → PDU/RPP → A/B feeds → rack
```

Potential concepts:

- A/B feeds;
- N, N+1, and 2N;
- UPS capacity;
- maintenance of one path;
- breaker or branch limits;
- load transfer.

Keep the current model as a basic mode.

#### 13. Expand liquid-cooling concepts

Potential concepts:

- facility and technology cooling loops;
- primary and secondary loops;
- supply and return temperatures;
- flow and delta-T;
- heat rejection;
- CDU redundancy.

Start with relationships and capacity, not a falsely precise thermodynamic simulation.

#### 14. Replace the network port abstraction with an optional topology model

Teach the distinction between:

- in-rack scale-up, such as NVLink/NVSwitch; and
- scale-out, such as InfiniBand or RoCE.

A staged implementation could be:

1. explain endpoint and switch-port counts;
2. visualize a simple leaf/spine topology;
3. model leaf/spine redundancy and isolation failures;
4. later consider rail-optimized topology, oversubscription, and cable counts.

The current simplified 288-port model should remain available until the deeper model is validated.

#### 15. Connect facility planning to the AI-infrastructure software layer

A later integration could map a facility design to a separate GPU-platform demonstration:

- Kubernetes or Slurm GPU scheduling;
- NVIDIA GPU Operator and DCGM metrics;
- NCCL or inference benchmark results;
- vLLM, Triton, or KServe capacity;
- GPU failure and OOM scenarios;
- cost per inference or per token.

This should not turn DataHall itself into a cluster manager. The better boundary may be an import format or linked companion project.

## Items to defer

### Unity and VR

Keep Unity paused unless there is a concrete requirement such as an on-site showcase, VR training engagement, offline desktop deployment, or a partner requesting high-fidelity asset interaction. The web version currently has much higher distribution and portfolio value.

### A third language

Use analytics to justify Japanese, Korean, or another language. Every language adds maintenance and test cost.

### Arbitrary user-defined equipment

Free-form parameters would reduce comparability and make misleading results easy to produce. If added later, custom equipment should be an expert mode and all affected results should be marked as user-supplied.

### Rapid catalog expansion

CloudMatrix 384 offers a meaningful architectural contrast. Other entries should wait for credible rack-level data. Every model adds sourcing, bilingual copy, assets, comparison logic, and tests; catalog size is not a primary success metric.

### Accounts and collaboration backend

Do not add authentication, cloud saves, comments, or multiplayer collaboration until share links, local snapshots, and exports demonstrate a real limitation.

## Suggested sequence

### Next milestone: credibility and explanation

1. Source metadata and uncertainty model.
2. In-app methodology and assumptions.
3. Annual energy and electricity cost.
4. Deterministic repair suggestions.
5. Two or three story-based scenarios.
6. Review analytics after a meaningful observation period.

### Following milestone: planning utility

1. Goal-based initial-layout generator.
2. Compare two user layouts.
3. Simplified ownership estimate.
4. Architecture report export.
5. Additional redundancy targets.

### Later milestone: infrastructure depth

1. Optional A/B power-chain model.
2. Liquid-cooling loop model.
3. Leaf/spine network topology.
4. Workload-to-GPU/rack mapping.
5. Integration with a companion GPU-platform project or telemetry dataset.

## Measures

Keep the current acquisition and tutorial measures, then add product-specific measures where possible:

- tutorial offer-to-start rate;
- tutorial completion rate;
- scenario completion rate;
- share-link open rate;
- screenshot or report export rate;
- percentage of sessions that reach a successful power-on;
- repeat visits after a shared scenario.

Respect the current privacy approach. Do not send layout contents, user-entered costs, or imported file contents to analytics.

## Review questions

Before promoting items from this proposal into `roadmap.md`, review:

1. Is the primary audience still a five-minute learner, or should serious planning become equally important?
2. Should source metadata live directly in `catalog.json` or in a separate source registry?
3. What is the minimum export-versioning change that preserves all existing links and fixtures?
4. Can repair suggestions remain deterministic, small, and fully testable?
5. Is a goal-based generator valuable before the application has multi-cell equipment?
6. Should reports be generated entirely client-side?
7. Which deeper model—power, cooling, or network—best supports the next portfolio or teaching goal?
8. Which proposed features should be rejected to keep the product focused?
