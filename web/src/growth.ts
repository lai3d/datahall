// Growth planning: devices come online in batches by deployment phase (phase, starting at 1); capacity is checked cumulatively per phase, and remaining rack headroom is estimated. Pure functions, no DOM dependency.
import {compute, PUE_FACTORS} from './sim.ts';
import {blockingReasons} from './redundancy.ts';
import type {Reason, ReasonKind} from './redundancy.ts';
import type {Totals} from './sim.ts';
import type {Catalog, Item} from './types.ts';

export interface PhaseResult {
  phase: number; count: number; gpus: number; itKw: number; facilityKw: number;
  util: Record<ReasonKind, number>; tightest: {kind: ReasonKind; ratio: number}; reasons: Reason[];
}

// Highest deployment phase. The share link, the UI and imports all use this cap
export const MAX_PHASE = 20;

export const phaseOf = (it: {phase?: number}): number => it.phase || 1;

// Phases present in the layout, ascending; an empty layout returns []
export const phasesIn = (items: {phase?: number}[]): number[] => [...new Set(items.map(phaseOf))].sort((a, b) => a - b);

// Utilization of the five capacities (demand / capacity). Zero capacity with demand counts as Infinity; both zero counts as 0
export function utilization(s: Totals, utility: number): Record<ReasonKind, number>{
  const ratio = (need: number, cap: number): number => cap > 0 ? need / cap : need > 0 ? Infinity : 0;
  return {
    dist: ratio(s.it, s.dist),
    liquid: ratio(s.liqHeat, s.liqCap),
    air: ratio(s.airHeat, s.airCap),
    network: ratio(s.gpus, s.ports),
    utility: ratio(s.facility, utility * 1000),
  };
}

// Cumulative per phase: phase p includes all devices with phase ≤ p.
// Returns [{phase, count, gpus, itKw, facilityKw, util, tightest: {kind, ratio}, reasons}]
export function growthPlan(items: Item[], CAT: Catalog, utility: number): PhaseResult[]{
  return phasesIn(items).map(phase => {
    const upTo = items.filter(it => phaseOf(it) <= phase);
    const s = compute(upTo, CAT, utility);
    const util = utilization(s, utility);
    const [kind, ratio] = (Object.entries(util) as [ReasonKind, number][]).reduce((a, b) => b[1] > a[1] ? b : a);
    return {phase, count: upTo.length, gpus: s.gpus, itKw: s.it, facilityKw: s.facility, util,
      tightest: {kind, ratio}, reasons: blockingReasons(upTo, CAT, utility)};
  });
}

// How many more racks of type fit on top of the existing devices, and which constraint runs out first.
// Only hall-wide totals are considered (distribution, liquid cooling, air cooling, network ports, utility), not free floor cells or per-CDU / RPP nearest assignment.
// Constraints already exceeded give 0 racks. If type consumes none of them, limit is null and count is Infinity
export function headroom(items: Item[], CAT: Catalog, utility: number, type: string): {limit: ReasonKind | null; count: number}{
  const s = compute(items, CAT, utility), t = CAT[type];
  const kw = t.kw || 0, liq = t.liq || 0;
  // Demand added per rack, matching the PUE formula in sim.ts: IT + overhead + cooling for liquid and air heat + distribution losses
  const need: Record<ReasonKind, number> = {
    dist: kw,
    liquid: kw * liq,
    air: kw * (1 - liq),
    network: t.gpus || 0,
    utility: kw + (t.ovh || 0) + kw * liq * PUE_FACTORS.liquid + kw * (1 - liq) * PUE_FACTORS.air + kw * PUE_FACTORS.losses,
  };
  const left: Record<ReasonKind, number> = {
    dist: s.dist - s.it,
    liquid: s.liqCap - s.liqHeat,
    air: s.airCap - s.airHeat,
    network: s.ports - s.gpus,
    utility: utility * 1000 - s.facility,
  };
  let best: {limit: ReasonKind | null; count: number} = {limit: null, count: Infinity};
  for (const kind of Object.keys(need) as ReasonKind[]){
    if (!(need[kind] > 0)) continue;
    const n = Math.max(0, Math.floor(left[kind] / need[kind] + 1e-9));
    if (n < best.count) best = {limit: kind, count: n};
  }
  return best;
}
