import {describe, expect, it} from 'vitest';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID, keyOf} from '../src/grid.ts';
import {UTILITY_OPTIONS} from '../src/sim.ts';
import {blockingReasons, singlePointsOfFailure} from '../src/redundancy.ts';
import {generateLayout, rackCells, maxGoalRacks} from '../src/goal.ts';
import type {Item} from '../src/types.ts';

const count = (list: Item[], type: string) => list.filter(i => i.type === type).length;

describe('rack rows', () => {
  it('centers each row and spreads rows down the hall', () => {
    expect(rackCells(8, GRID)).toEqual([4, 5, 6, 7, 8, 9, 10, 11].map(x => ({x, z: 4})));
    expect(new Set(rackCells(20, GRID).map(c => c.z))).toEqual(new Set([2, 6]));
    expect(rackCells(maxGoalRacks(GRID), GRID)).toHaveLength(maxGoalRacks(GRID));
    expect(rackCells(maxGoalRacks(GRID) + 1, GRID)).toEqual([]);
  });
});

describe('layout from a goal', () => {
  it('builds the tutorial hall from "576 GB200 GPUs at 2 MW"', () => {
    const r = generateLayout({type: 'gb200', gpus: 576, utility: 2, n1: false}, CAT, GRID)!;
    expect(r).toMatchObject({racks: 8, gpus: 576, limit: null});
    expect(['rpp', 'cdu', 'crah', 'ib'].map(t => count(r.list, t))).toEqual([2, 2, 2, 2]);
  });

  it('stops at the feed and says so', () => {
    const r = generateLayout({type: 'vr200', gpus: 2000, utility: 5, n1: false}, CAT, GRID)!;
    expect(r.limit).toBe('utility');
    expect(r.racks).toBe(r.maxRacks);
  });

  it('stops at the floor for low-power racks', () => {
    expect(generateLayout({type: 'dgx', gpus: 5000, utility: 10, n1: false}, CAT, GRID)).toMatchObject({racks: maxGoalRacks(GRID), limit: 'floor'});
  });

  it('says when N+1 redundancy is what limits the hall', () => {
    // An 800 kW CDU cannot carry two 600 kW Kyber racks, so no neighbour can take over from a failed one
    const r = generateLayout({type: 'kyber', gpus: 5000, utility: 10, n1: true}, CAT, GRID)!;
    expect(r.limit).toBe('n1');
    expect(r.racks).toBeGreaterThan(0);
  });

  it('rejects goals it cannot read', () => {
    expect(generateLayout({type: 'cdu', gpus: 100, utility: 2, n1: false}, CAT, GRID)).toBeNull();
    expect(generateLayout({type: 'gb200', gpus: 0, utility: 2, n1: false}, CAT, GRID)).toBeNull();
  });

  const cases: [string, string, number, boolean][] = [];
  for (const t of CATALOG.filter(t => t.gpus)) for (const u of UTILITY_OPTIONS) for (const n1 of [false, true]) cases.push([`${t.id}, 4 racks, ${u} MW${n1 ? ', N+1' : ''}`, t.id, u, n1]);
  it.each(cases)('%s: the layout passes every check it promises', (_, type, u, n1) => {
    const per = CAT[type].gpus!;
    const r = generateLayout({type, gpus: per * 4, utility: u, n1}, CAT, GRID)!;
    expect(r.racks).toBeGreaterThan(0);
    expect(r.racks).toBeLessThanOrEqual(4);
    expect(r.gpus).toBe(r.racks * per);
    expect(count(r.list, type)).toBe(r.racks);
    if (r.limit === null) expect(r.racks).toBe(4);
    expect(blockingReasons(r.list, CAT, u)).toEqual([]);
    if (n1) expect(singlePointsOfFailure(r.list, CAT, u)).toEqual([]);
    const keys = r.list.map(i => keyOf(i.x, i.z));
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of r.list) expect(i.x >= 0 && i.x < GRID.GW && i.z >= 0 && i.z < GRID.GD).toBe(true);
  });
});
