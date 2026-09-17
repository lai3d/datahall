// Rack comparison: for each GPU rack type, the largest hall a utility feed can power, with just enough CDUs, RPPs, in-row coolers
// and IB switch racks to pass the capacity check. Pure functions, no DOM dependency.
// Only hall-wide totals count (the same simplification as headroom in growth.ts): per-device nearest assignment is not checked,
// and the floor limit is the number of grid cells, not a real placement.
import {compute} from './sim.ts';
import type {Catalog, Grid, Item} from './types.ts';

export interface HallSize {
  type: string;
  racks: number;
  support: {cdu: number; rpp: number; crah: number; ib: number};
  gpus: number; itKw: number; facilityKw: number; pue: number; capex: number;
  limit: 'utility' | 'floor';   // what stops one more rack
}

const up = (need: number, per: number | undefined): number => need > 0 && per ? Math.ceil(need / per - 1e-9) : 0;

// The fewest support devices that cover `racks` racks of `type`. IB switch racks draw power and add air-cooled heat, so they are counted first
export function supportFor(type: string, racks: number, CAT: Catalog): HallSize['support']{
  const t = CAT[type], kw = t.kw || 0, liq = t.liq || 0, ib = CAT.ib;
  const ibs = up(racks * (t.gpus || 0), ib.ports);
  return {
    ib: ibs,
    rpp: up(racks * kw + ibs * (ib.kw || 0), CAT.rpp.dist),
    cdu: up(racks * kw * liq, CAT.cdu.liqCool),
    crah: up(racks * kw * (1 - liq) + ibs * (ib.kw || 0) * (1 - (ib.liq || 0)), CAT.crah.airCool),
  };
}

function hallItems(type: string, racks: number, support: HallSize['support'], grid: Grid): Item[]{
  const types = [...Array(racks).fill(type), ...(['cdu', 'rpp', 'crah', 'ib'] as const).flatMap(k => Array(support[k]).fill(k))];
  return types.map((t, i) => ({type: t, x: i % grid.GW, z: Math.floor(i / grid.GW)}));
}

export function largestHall(type: string, CAT: Catalog, utility: number, grid: Grid): HallSize{
  const cells = grid.GW * grid.GD;
  let best: HallSize | null = null;
  for (let racks = 1; ; racks++){
    const support = supportFor(type, racks, CAT);
    const devices = racks + support.cdu + support.rpp + support.crah + support.ib;
    if (devices > cells) return finish(best, type, support, 'floor');
    const s = compute(hallItems(type, racks, support, grid), CAT, utility);
    if (s.blocking) return finish(best, type, support, 'utility');
    best = {type, racks, support, gpus: s.gpus, itKw: s.it, facilityKw: s.facility, pue: s.pue, capex: s.capex, limit: 'utility'};
  }
}
function finish(best: HallSize | null, type: string, support: HallSize['support'], limit: HallSize['limit']): HallSize{
  return best ? {...best, limit} : {type, racks: 0, support: {cdu: 0, rpp: 0, crah: 0, ib: 0}, gpus: 0, itKw: 0, facilityKw: 0, pue: 0, capex: 0, limit};
}

export function compareRacks(CAT: Catalog, utility: number, grid: Grid): HallSize[]{
  return Object.values(CAT).filter(t => t.gpus).map(t => largestHall(t.id, CAT, utility, grid));
}
