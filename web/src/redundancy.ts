// Failure drills and N+1 redundancy checks. Pure functions, no DOM dependency.
// Failed devices are removed from the computation: they provide no capacity and draw no power; remaining devices are reassigned to the nearest unit via supplyLinks.
import {compute, over} from './sim.ts';
import {supplyLoads, reportedOverloads} from './supply.ts';
import type {Catalog, CatalogItem, Item} from './types.ts';

export type ReasonKind = 'dist' | 'liquid' | 'air' | 'network' | 'utility';
export type Reason<T extends Item = Item> = {kind: ReasonKind} | {kind: 'overload'; item: T};

// Facilities that can be marked failed: devices providing liquid cooling, distribution, air cooling or network ports (GPU racks and storage racks do not count)
export const canFail = (t: CatalogItem | undefined): boolean => !!(t && (t.liqCool || t.dist || t.airCool || t.ports));

// Reasons for failing the capacity check, one-to-one with the UI's "cannot power on" conditions:
// {kind: 'dist' | 'liquid' | 'air' | 'network' | 'utility'} or {kind: 'overload', item}
export function blockingReasons<T extends Item>(list: T[], CAT: Catalog, utility: number): Reason<T>[]{
  const s = compute(list, CAT, utility);
  const reasons: Reason<T>[] = [];
  if (over(s.it, s.dist)) reasons.push({kind: 'dist'});
  if (over(s.liqHeat, s.liqCap)) reasons.push({kind: 'liquid'});
  if (over(s.airHeat, s.airCap)) reasons.push({kind: 'air'});
  if (s.gpus > s.ports) reasons.push({kind: 'network'});
  if (over(s.facility, utility * 1000)) reasons.push({kind: 'utility'});
  const loads = supplyLoads(list, CAT);
  for (const kind of ['cdu', 'rpp'] as const) reportedOverloads(loads, s, kind).forEach(([item]) => reasons.push({kind: 'overload', item}));
  return reasons;
}

// Fail each failable facility on its own and return the devices whose failure makes the hall fail the capacity check [{item, reasons}] (sorted by row, then column).
// Returns null when the layout itself fails the capacity check: redundancy is moot then
export function singlePointsOfFailure<T extends Item>(list: T[], CAT: Catalog, utility: number): {item: T; reasons: Reason<T>[]}[] | null{
  if (blockingReasons(list, CAT, utility).length) return null;
  return list.filter(i => canFail(CAT[i.type]))
    .map(item => ({item, reasons: blockingReasons(list.filter(i => i !== item), CAT, utility)}))
    .filter(r => r.reasons.length)
    .sort((a, b) => (a.item.z - b.item.z) || (a.item.x - b.item.x));
}
