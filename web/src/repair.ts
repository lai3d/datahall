// Repair suggestions for a hall that cannot power on: which support units to add and where, whether a bigger utility feed is needed,
// and, when the feed is the limit, how many racks to remove instead. Deterministic and pure, no DOM dependency.
// Every option is checked with blockingReasons (hall-wide totals and per-device nearest assignment), so `passes` means the layout
// would really power on, not just that the totals add up.
import {blockingReasons} from './redundancy.ts';
import {supplyLoads, reportedOverloads} from './supply.ts';
import {compute, UTILITY_OPTIONS} from './sim.ts';
import {keyOf} from './grid.ts';
import type {Catalog, Grid, Item, Pos} from './types.ts';

export type SupportType = 'rpp' | 'cdu' | 'crah' | 'ib';
export const SUPPORT_TYPES: SupportType[] = ['rpp', 'cdu', 'crah', 'ib'];
export interface RepairOption {
  utility: number | null;   // raise the utility feed to this many MW, or null to keep it
  remove: Item[];           // racks to remove, from the end of the rows
  add: Item[];              // support units to place, with their cells
  passes: boolean;          // the resulting layout passes every check
}

const MAX_OVERLOAD_STEPS = 24;
const byCell = (a: Pos, b: Pos) => a.z - b.z || a.x - b.x;

// Free cells ordered by the nearest-assignment distance to a point (a row away counts double), ties by row then column
export function freeCellsNear(target: {x: number; z: number}, occupied: Set<string>, grid: Grid): Pos[]{
  const cells: Pos[] = [];
  for (let z = 0; z < grid.GD; z++) for (let x = 0; x < grid.GW; x++) if (!occupied.has(keyOf(x, z))) cells.push({x, z});
  const d = (c: Pos) => Math.hypot(c.x - target.x, (c.z - target.z) * 2);
  return cells.sort((a, b) => d(a) - d(b) || byCell(a, b));
}
export const centroid = (list: Pos[], grid: Grid) => list.length
  ? {x: list.reduce((n, i) => n + i.x, 0) / list.length, z: list.reduce((n, i) => n + i.z, 0) / list.length}
  : {x: (grid.GW - 1) / 2, z: (grid.GD - 1) / 2};

// Which devices each support type serves, and how much of its capacity each one uses (CDUs and RPPs only)
const serves: Record<SupportType, (t: Catalog[string]) => boolean> = {
  rpp: t => !!t.kw, cdu: t => !!t.kw && !!t.liq, crah: t => !!t.kw && (t.liq ?? 0) < 1, ib: t => !!t.gpus,
};
const PER_DEVICE = {rpp: {load: (t: Catalog[string]) => t.kw ?? 0, cap: 'dist'}, cdu: {load: (t: Catalog[string]) => (t.kw ?? 0) * (t.liq ?? 0), cap: 'liqCool'}} as const;

// 1. Count the units the hall-wide totals need; positions do not matter to the totals. Units that add load (IB racks draw power and
//    make air heat) are counted before re-checking.
// 2. Place them next to the devices they serve. RPPs and CDUs go first, since their load is checked per unit and they need the cells beside
//    the racks; RPP groups keep 10% spare for IB racks and in-row coolers placed after them. For CDUs and RPPs,
//    whose load is checked per unit, the served devices are packed in row then column order into groups that fit one unit, and a
//    group gets a unit unless one is already close; more units than the totals need are added when the groups require it.
// 3. While a CDU or RPP is still overloaded under nearest assignment, take its consumers from the farthest in, and add a unit of its type
//    on the free cell nearest to the first one that the new unit would win (strictly nearer, or equal and first in row then column order).
// 4. Drop any added unit the hall does not need to pass, last added first.
// Returns null when the floor runs out
export function addSupport(base: Item[], CAT: Catalog, utility: number, occupied: Set<string>, grid: Grid): Item[] | null{
  const need = new Map<SupportType, number>(SUPPORT_TYPES.map(t => [t, 0]));
  const counted = () => SUPPORT_TYPES.flatMap(t => Array.from({length: need.get(t)!}, (): Item => ({type: t, x: -1, z: -1})));
  for (let guard = 0; guard < 400; guard++){
    const s = compute([...base, ...counted()], CAT, utility);
    const short: SupportType | null = s.it > s.dist ? 'rpp' : s.liqHeat > s.liqCap ? 'cdu' : s.airHeat > s.airCap ? 'crah' : s.gpus > s.ports ? 'ib' : null;
    if (!short) break;
    need.set(short, need.get(short)! + 1);
  }

  const taken = new Set(occupied), add: Item[] = [];
  const all = () => [...base, ...add];
  const place = (type: SupportType, near: {x: number; z: number}) => {
    const cell = freeCellsNear(near, taken, grid)[0];
    if (!cell) return false;
    taken.add(keyOf(cell.x, cell.z));
    add.push({type, x: cell.x, z: cell.z});
    return true;
  };
  const gap = (type: SupportType, c: {x: number; z: number}) =>
    Math.min(Infinity, ...all().filter(u => u.type === type).map(u => Math.hypot(u.x - c.x, (u.z - c.z) * 2)));
  for (const type of ['rpp', 'cdu', 'ib', 'crah'] as const){
    const served = all().filter(i => serves[type](CAT[i.type])).sort(byCell);
    const existing = all().filter(i => i.type === type).length;
    let groups: Item[][];
    if (type === 'rpp' || type === 'cdu'){
      const {load, cap} = PER_DEVICE[type], capacity = (CAT[type][cap] ?? Infinity) * (type === 'rpp' ? .9 : 1);
      groups = [];
      let sum = Infinity;
      for (const d of served){
        const l = load(CAT[d.type]);
        if (sum + l > capacity){ groups.push([]); sum = 0; }
        groups[groups.length - 1].push(d);
        sum += l;
      }
    } else {
      const size = Math.max(1, Math.ceil(served.length / (existing + need.get(type)!)));
      groups = Array.from({length: Math.ceil(served.length / size)}, (_, g) => served.slice(g * size, (g + 1) * size));
    }
    const centres = groups.length ? groups.map(g => centroid(g, grid)) : [centroid(served, grid)];
    // A group already has a unit when one of its type is within reach: the next row over, or the group's own spread
    const reach = (g: number) => Math.max(2, ...(groups[g] ?? []).map(d => Math.hypot(d.x - centres[g].x, (d.z - centres[g].z) * 2))) + 1e-9;
    const served_ = new Set(centres.map((c, g) => g).filter(g => gap(type, centres[g]) <= reach(g)));
    const n = Math.max(need.get(type)!, type === 'rpp' || type === 'cdu' ? centres.length - served_.size : 0);
    for (let k = 0; k < n; k++){
      // Groups without a unit first, the one farthest from any unit of this type; then any group, again farthest first
      const open = centres.map((c, g) => g).filter(g => !served_.has(g));
      const pool = open.length ? open : centres.map((c, g) => g);
      const g = pool.reduce((a, b) => gap(type, centres[b]) > gap(type, centres[a]) + 1e-9 ? b : a);
      if (!place(type, centres[g])) return null;
      served_.add(g);
    }
  }

  const dist = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, (a.z - b.z) * 2);
  overload: for (let step = 0; step < MAX_OVERLOAD_STEPS; step++){
    const list = all();
    const s = compute(list, CAT, utility), loads = supplyLoads(list, CAT);
    const overloaded = (['cdu', 'rpp'] as const).flatMap(kind => reportedOverloads(loads, s, kind)).sort(([a], [b]) => byCell(a, b));
    if (!overloaded.length) break;
    for (const [unit, supply] of overloaded){
      const far = [...supply.consumers].sort((a, b) => dist(b, unit) - dist(a, unit) || byCell(a, b));
      for (const c of far){
        const d = dist(c, unit);
        const cell = freeCellsNear(c, taken, grid).find(f => dist(f, c) < d - 1e-9 || (Math.abs(dist(f, c) - d) <= 1e-9 && byCell(f, unit) < 0));
        if (cell && place(unit.type as SupportType, cell)) continue overload;
      }
    }
    break;
  }

  if (!blockingReasons(all(), CAT, utility).length){
    for (let i = add.length - 1; i >= 0; i--){
      const without = add.filter((_, j) => j !== i);
      if (!blockingReasons([...base, ...without], CAT, utility).length) add.splice(i, 1);
    }
  }
  return add;
}

function option(base: Item[], remove: Item[], CAT: Catalog, utility: number, raiseTo: number | null, occupied: Set<string>, grid: Grid): RepairOption | null{
  const u = raiseTo ?? utility;
  const removed = new Set(remove);
  const kept = base.filter(i => !removed.has(i));
  const free = new Set([...occupied].filter(k => !remove.some(r => keyOf(r.x, r.z) === k)));
  const add = addSupport(kept, CAT, u, free, grid);
  if (!add) return null;
  return {utility: raiseTo, remove, add, passes: blockingReasons([...kept, ...add], CAT, u).length === 0};
}

// items: the devices in the current calculation; occupied: every occupied cell, including failed or later-phase devices.
// Returns null when the hall already passes. The first option is the recommended one; a second option, when present,
// keeps the current utility feed and removes racks instead of raising it
export function planRepair(items: Item[], CAT: Catalog, utility: number, occupied: Set<string>, grid: Grid): RepairOption[] | null{
  if (!blockingReasons(items, CAT, utility).length) return null;
  const options: RepairOption[] = [];
  const keep = option(items, [], CAT, utility, null, occupied, grid);
  if (keep?.passes) return [keep];
  // The feed is the limit: the smallest bigger feed that works
  for (const u of UTILITY_OPTIONS.filter(u => u > utility)){
    const raised = option(items, [], CAT, utility, u, occupied, grid);
    if (raised?.passes){ options.push(raised); break; }
  }
  // Or keep the feed and remove racks of the most common type, from the end of the rows
  const counts = new Map<string, number>();
  items.forEach(i => { if (CAT[i.type].gpus) counts.set(i.type, (counts.get(i.type) || 0) + 1); });
  const type = [...counts].sort((a, b) => b[1] - a[1] || Object.keys(CAT).indexOf(a[0]) - Object.keys(CAT).indexOf(b[0]))[0]?.[0];
  if (type){
    const candidates = items.filter(i => i.type === type).sort((a, b) => byCell(b, a));
    for (let n = 1; n < candidates.length; n++){
      const fewer = option(items, candidates.slice(0, n), CAT, utility, null, occupied, grid);
      if (fewer?.passes){ options.push(fewer); break; }
    }
  }
  return options.length ? options : keep ? [keep] : [];
}

// Count of each support type in an option, in SUPPORT_TYPES order
export const addCounts = (o: RepairOption): [SupportType, number][] =>
  SUPPORT_TYPES.map(t => [t, o.add.filter(i => i.type === t).length] as [SupportType, number]).filter(([, n]) => n > 0);
