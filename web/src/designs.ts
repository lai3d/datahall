// Compare two designs: the hall on screen against one the user pinned (or opened from a share link), pure functions.
// A design is summarized from its whole layout, every phase and ignoring the failure drill, like the architecture report,
// so the comparison never depends on what the panel is showing. Numbers only; ui.tsx formats them
import {compute} from './sim.ts';
import {blockingReasons, singlePointsOfFailure} from './redundancy.ts';
import type {Reason} from './redundancy.ts';
import {annualEnergy} from './energy.ts';
import type {EnergyInputs} from './energy.ts';
import {toItems} from './edit.ts';
import type {Catalog, Layout} from './types.ts';

export interface DesignSummary {
  devices: number;                      // also the floor cells used: one device per cell
  racks: [type: string, n: number][];   // GPU racks by type, most first
  gpus: number;
  itKw: number;
  facilityKw: number;
  pue: number;                          // 0 for an empty hall
  utilityMw: number;
  capexM: number;
  energyMWh: number;                    // a year at the energy inputs' average load
  costUsd: number;                      // a year at the energy inputs' price
  problems: Reason['kind'][];               // why it cannot power on, deduplicated; empty when it can
  spof: number | null;                  // single points of failure; null when the hall is empty or cannot power on to begin with
}

export function summarize(layout: Layout, CAT: Catalog, energy: EnergyInputs): DesignSummary{
  const list = toItems(layout.list).filter(i => Object.hasOwn(CAT, i.type));
  const s = compute(list, CAT, layout.u);
  const e = annualEnergy(s, energy);
  const racks = new Map<string, number>();
  for (const i of list) if (CAT[i.type].gpus) racks.set(i.type, (racks.get(i.type) ?? 0) + 1);
  const spof = singlePointsOfFailure(list, CAT, layout.u);
  return {
    devices: list.length,
    racks: [...racks].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    gpus: s.gpus,
    itKw: s.it,
    facilityKw: s.facility,
    pue: s.it ? s.pue : 0,
    utilityMw: layout.u,
    capexM: s.capex,
    energyMWh: s.it ? e.totalMWh : 0,
    costUsd: s.it ? e.cost : 0,
    problems: [...new Set(blockingReasons(list, CAT, layout.u).map(r => r.kind))],
    spof: spof === null || !list.length ? null : spof.length,
  };
}

// Figures compared side by side, in panel order; `better` says which direction is an improvement, so the panel can
// mark it (more GPUs is better, more power or cost is not). Neutral rows are context, like the feed
export type Metric = 'gpus' | 'devices' | 'itKw' | 'facilityKw' | 'pue' | 'utilityMw' | 'capexM' | 'energyMWh' | 'costUsd';
export const METRICS: {key: Metric; better: 'up' | 'down' | null}[] = [
  {key: 'gpus', better: 'up'},
  {key: 'devices', better: null},
  {key: 'itKw', better: null},
  {key: 'facilityKw', better: null},
  {key: 'pue', better: 'down'},
  {key: 'utilityMw', better: null},
  {key: 'capexM', better: null},
  {key: 'energyMWh', better: null},
  {key: 'costUsd', better: null},
];

// Change from the pinned design to the current one, with whether that is better, worse or neither
export function delta(pinned: DesignSummary, current: DesignSummary, key: Metric): {d: number; verdict: 'better' | 'worse' | 'same' | 'neutral'}{
  const d = current[key] - pinned[key];
  const better = METRICS.find(m => m.key === key)?.better ?? null;
  if (Math.abs(d) < 1e-9) return {d: 0, verdict: 'same'};
  if (!better) return {d, verdict: 'neutral'};
  return {d, verdict: (d > 0) === (better === 'up') ? 'better' : 'worse'};
}
