// Generate a starting layout from a goal: a rack type, a GPU count, a utility feed and optionally N+1 redundancy.
// Racks go in centered rows with room between them; repair.ts's addSupport places just enough RPPs, CDUs, in-row coolers and IB racks
// beside them; for N+1, one more unit is added wherever losing a single facility would stop the hall. When the goal does not fit,
// the rack count comes down until it does, and the result says what limited it. Deterministic and pure, no DOM dependency.
import {blockingReasons, singlePointsOfFailure} from './redundancy.ts';
import {supplyLoads} from './supply.ts';
import {largestHall} from './compare.ts';
import {addSupport, centroid, freeCellsNear} from './repair.ts';
import {keyOf} from './grid.ts';
import type {Catalog, Grid, Item} from './types.ts';

export interface Goal {type: string; gpus: number; utility: number; n1: boolean}
// utility: the feed; floor: grid cells or the four rack rows; layout: per-device assignment once laid out; n1: keeping it N+1 redundant
export type GoalLimit = 'utility' | 'floor' | 'layout' | 'n1';
export interface GoalResult {
  list: Item[];              // racks first, then support units
  racks: number;
  gpus: number;
  limit: GoalLimit | null;   // why fewer racks than asked for, or null when the goal fits
  maxRacks: number;          // most racks of this type the feed and floor allow (totals only, as in the rack comparison)
}

// Rack rows for n racks: one to four rows spread down the hall, each centered, leaving the rows between them for support units
const ROWS: Record<number, number[]> = {1: [4], 2: [2, 6], 3: [1, 4, 7], 4: [0, 3, 6, 9]};
export function rackCells(n: number, grid: Grid): {x: number; z: number}[]{
  const rows = ROWS[Math.max(1, Math.ceil(n / grid.GW))];
  if (!rows) return [];
  const cells: {x: number; z: number}[] = [];
  rows.forEach((z, r) => {
    const k = Math.min(grid.GW, n - r * grid.GW);
    const x0 = Math.floor((grid.GW - k) / 2);
    for (let i = 0; i < k; i++) cells.push({x: x0 + i, z});
  });
  return cells;
}
export const MAX_GOAL_RACKS = Object.keys(ROWS).length * 16;

const MAX_N1_STEPS = 40;

// Add units until no single failed facility stops the hall: take the first facility whose loss breaks it and add another of its type
// next to the devices it serves. Returns null when the floor runs out or the extra units break the hall (for example the feed)
function makeN1(list: Item[], CAT: Catalog, utility: number, grid: Grid): Item[] | null{
  const out = [...list], taken = new Set(out.map(i => keyOf(i.x, i.z)));
  const racks = out.filter(i => CAT[i.type].gpus);
  for (let step = 0; step < MAX_N1_STEPS; step++){
    const spof = singlePointsOfFailure(out, CAT, utility);
    if (!spof) return null;
    if (!spof.length) return out;
    const {item} = spof[0];
    const supply = supplyLoads(out, CAT).supplies.get(item);
    const near = centroid(supply?.consumers.length ? supply.consumers : racks, grid);
    const cell = freeCellsNear(near, taken, grid)[0];
    if (!cell) return null;
    taken.add(keyOf(cell.x, cell.z));
    out.push({type: item.type, x: cell.x, z: cell.z});
  }
  return null;
}

function attempt(goal: Goal, racks: number, CAT: Catalog, grid: Grid): Item[] | null{
  const base: Item[] = rackCells(racks, grid).map(c => ({type: goal.type, ...c}));
  if (base.length < racks) return null;
  const add = addSupport(base, CAT, goal.utility, new Set(base.map(i => keyOf(i.x, i.z))), grid);
  if (!add) return null;
  const list = [...base, ...add];
  if (blockingReasons(list, CAT, goal.utility).length) return null;
  return goal.n1 ? makeN1(list, CAT, goal.utility, grid) : list;
}

export function generateLayout(goal: Goal, CAT: Catalog, grid: Grid): GoalResult | null{
  const t = CAT[goal.type];
  if (!t?.gpus || !(goal.gpus > 0)) return null;
  const wanted = Math.ceil(goal.gpus / t.gpus);
  const max = largestHall(goal.type, CAT, goal.utility, grid);
  const maxRacks = Math.min(max.racks, MAX_GOAL_RACKS);
  let racks = Math.min(wanted, maxRacks);
  // The totals-only maximum can still fail once racks are laid out (per-device assignment, N+1), so step down until a layout passes
  for (; racks > 0; racks--){
    const list = attempt(goal, racks, CAT, grid);
    if (!list) continue;
    return {list, racks, gpus: racks * t.gpus, limit: racks >= wanted ? null : limitOf(goal, racks), maxRacks};
  }
  return {list: [], racks: 0, gpus: 0, limit: limitOf(goal, 0), maxRacks};

  function limitOf(g: Goal, fitted: number): GoalLimit{
    if (g.n1 && fitted < maxRacks && attempt({...g, n1: false}, fitted + 1, CAT, grid)) return 'n1';
    if (fitted < maxRacks) return 'layout';
    return maxRacks === MAX_GOAL_RACKS || max.limit === 'floor' ? 'floor' : 'utility';
  }
}
