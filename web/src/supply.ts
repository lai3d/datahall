// Per-device capacity check: each CDU and RPP compares the load assigned to it by topology (supplyLinks in grid.ts, nearest assignment) with its own capacity.
// compute() in sim.ts only checks hall-wide totals; a single unit can still be overloaded when totals are sufficient. Pure functions, no DOM dependency.
// Web-only: compute() is a contract shared with Unity (spec/capacity-cases.json), so it is not changed here.
import {supplyLinks} from './grid.ts';
import {fmt} from './sim.ts';
import {tr, loc} from './i18n.ts';
import type {Links} from './grid.ts';
import type {Totals, Issue} from './sim.ts';
import type {Catalog, CatalogItem, FeedField, Item} from './types.ts';

export type SupplyKind = 'cdu' | 'rpp';
export interface Supply<T extends Item = Item> {kind: SupplyKind; loadKw: number; capacityKw: number; consumers: T[]; overloaded: boolean}
export interface Loads<T extends Item = Item> {
  supplies: Map<T, Supply<T>>;
  links: Map<T, Links<T>>;
  unconnected: {item: T; needs: SupplyKind}[];
}

// Per supply type: which topology field finds its consumers, the consumer load, its own capacity field, and the name used in messages
const KINDS: Record<SupplyKind, {link: FeedField; load: (t: CatalogItem) => number; capacity: 'liqCool' | 'dist'; label: string; message: 'overloadCdu' | 'overloadRpp'}> = {
  cdu: {link: 'coolantSource', load: t => (t.kw || 0) * (t.liq || 0), capacity: 'liqCool', label: 'CDU', message: 'overloadCdu'},
  rpp: {link: 'powerFeed', load: t => t.kw || 0, capacity: 'dist', label: 'RPP', message: 'overloadRpp'},
};
const KIND_IDS = Object.keys(KINDS) as SupplyKind[];
const isSupplyKind = (type: string): type is SupplyKind => type in KINDS;
const MAX_LISTED = 3;

// list: [{type, x, z}]. Returns
//   supplies: Map(supply device → {kind, loadKw, capacityKw, consumers, overloaded})
//   links: Map(device → {coolantSource, powerFeed})
//   unconnected: devices that need liquid cooling or power but have no matching supply equipment in the hall [{item, needs: 'cdu' | 'rpp'}]
export function supplyLoads<T extends Item>(list: T[], CAT: Catalog): Loads<T>{
  const placed = list.filter(i => CAT[i.type]);
  const links = supplyLinks(placed, CAT);
  const supplies = new Map<T, Supply<T>>();
  for (const it of placed){
    if (isSupplyKind(it.type)) supplies.set(it, {kind: it.type, loadKw: 0, capacityKw: CAT[it.type][KINDS[it.type].capacity] || 0, consumers: [], overloaded: false});
  }
  const unconnected: Loads<T>['unconnected'] = [];
  for (const it of placed){
    const t = CAT[it.type];
    for (const id of KIND_IDS){
      const kind = KINDS[id], load = kind.load(t);
      if (!(load > 0)) continue;
      const source = links.get(it)![kind.link];
      if (!source){ unconnected.push({item: it, needs: id}); continue; }
      const s = supplies.get(source)!;
      s.loadKw += load;
      s.consumers.push(it);
    }
  }
  for (const s of supplies.values()) s.overloaded = s.loadKw > s.capacityKw + 1e-9;
  return {supplies, links, unconnected};
}

// Overloaded devices to report [[item, supply], ...], sorted by row then column. When the hall-wide total for a resource is already insufficient
// (compute already reports "not enough distribution" / "not enough liquid cooling"), those devices are not listed individually, to avoid duplicates
export function reportedOverloads<T extends Item>(loads: Loads<T>, totals: Totals, kind: SupplyKind): [T, Supply<T>][]{
  const globalShort: Record<SupplyKind, boolean> = {cdu: totals.liqHeat > totals.liqCap, rpp: totals.it > totals.dist};
  if (globalShort[kind]) return [];
  return [...loads.supplies].filter(([, s]) => s.kind === kind && s.overloaded)
    .sort(([a], [b]) => (a.z - b.z) || (a.x - b.x));
}

export function supplyIssues(loads: Loads, totals: Totals): Issue[]{
  const issues: Issue[] = [];
  for (const id of KIND_IDS){
    const kind = KINDS[id], over = reportedOverloads(loads, totals, id);
    over.slice(0, MAX_LISTED).forEach(([it, s]) => issues.push({lvl: 'bad',
      txt: tr(kind.message, {loc: loc(it.x, it.z), n: s.consumers.length, load: fmt(s.loadKw), cap: fmt(s.capacityKw)})}));
    if (over.length > MAX_LISTED) issues.push({lvl: 'bad', txt: tr('overloadMore', {n: over.length - MAX_LISTED, label: kind.label})});
  }
  return issues;
}
