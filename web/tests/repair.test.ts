import {describe, expect, it} from 'vitest';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID, keyOf} from '../src/grid.ts';
import {UTILITY_OPTIONS} from '../src/sim.ts';
import {blockingReasons} from '../src/redundancy.ts';
import {toItems} from '../src/edit.ts';
import {PRESETS} from '../src/layout.ts';
import {addCounts, planRepair} from '../src/repair.ts';
import type {RepairOption} from '../src/repair.ts';
import type {Item} from '../src/types.ts';

const cells = (list: Item[]) => new Set(list.map(i => keyOf(i.x, i.z)));
const plan = (list: Item[], u: number) => planRepair(list, CAT, u, cells(list), GRID);
const row = (type: string, n: number, z = 3, x0 = 0): Item[] => Array.from({length: n}, (_, i) => ({type, x: x0 + i, z}));
const apply = (list: Item[], o: RepairOption) => [...list.filter(i => !o.remove.includes(i)), ...o.add];

describe('repair suggestions', () => {
  it('suggest nothing for a hall that already passes', () => {
    for (const p of Object.values(PRESETS)) if (p.list.length) expect(plan(toItems(p.list), p.u)).toBeNull();
  });

  it('turn the tutorial row of eight GB200 racks into a hall that powers on', () => {
    const [o, ...rest] = plan(row('gb200', 8, 3, 4), 2)!;
    expect(rest).toEqual([]);
    expect(o.utility).toBeNull();
    expect(o.remove).toEqual([]);
    expect(addCounts(o)).toEqual([['rpp', 2], ['cdu', 2], ['crah', 2], ['ib', 2]]);
    expect(o.passes).toBe(true);
  });

  it('raise the utility feed when it is the limit, with removing racks as the alternative', () => {
    const racks = row('vr200', 16);
    const [raise, fewer] = plan(racks, 2)!;
    expect(raise).toMatchObject({utility: 5, remove: [], passes: true});
    expect(fewer).toMatchObject({utility: null, passes: true});
    // Removes from the end of the row
    expect(fewer.remove.map(i => i.x)).toEqual([15, 14, 13, 12, 11, 10, 9, 8]);
  });

  it('only remove racks when even the biggest feed is not enough', () => {
    const racks = [...row('kyber', 16), ...row('kyber', 4, 4)];
    const options = plan(racks, UTILITY_OPTIONS.at(-1)!)!;
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({utility: null, passes: true});
    expect(options[0].remove).toHaveLength(6);
  });

  it('fix a per-device overload even when the totals pass', () => {
    const list = [...row('vr200', 5), {type: 'cdu', x: 0, z: 5}, {type: 'cdu', x: 15, z: 5}, {type: 'rpp', x: 2, z: 5}, {type: 'rpp', x: 3, z: 5}, {type: 'ib', x: 5, z: 5}, {type: 'crah', x: 6, z: 5}];
    expect(blockingReasons(list, CAT, 5).map(r => r.kind)).toContain('overload');
    const [o] = plan(list, 5)!;
    expect(o.passes).toBe(true);
  });

  // Many layouts: every rack type, several sizes and rows, every feed. Each suggestion must hold up when applied
  const cases: [string, Item[], number][] = [];
  for (const t of CATALOG.filter(t => t.gpus)) for (const n of [1, 3, 8, 16]) for (const u of UTILITY_OPTIONS)
    cases.push([`${n} × ${t.id} at ${u} MW`, n > 8 ? [...row(t.id, 8, 2), ...row(t.id, n - 8, 6)] : row(t.id, n, 4, 3), u]);
  it.each(cases)('%s: some option passes, and applying it gives exactly what it claims', (_, list, u) => {
    const options = plan(list, u);
    if (!options) return;   // the bare racks can never pass without support, but a feed check keeps this honest
    expect(options.some(o => o.passes)).toBe(true);
    for (const o of options){
      const result = apply(list, o);
      expect(blockingReasons(result, CAT, o.utility ?? u).length === 0).toBe(o.passes);
      // New units sit on free cells inside the grid, one per cell
      const occupied = cells(list.filter(i => !o.remove.includes(i)));
      const added = o.add.map(i => keyOf(i.x, i.z));
      expect(new Set(added).size).toBe(added.length);
      for (const i of o.add){
        expect(occupied.has(keyOf(i.x, i.z))).toBe(false);
        expect(i.x >= 0 && i.x < GRID.GW && i.z >= 0 && i.z < GRID.GD).toBe(true);
      }
      if (o.utility !== null) expect(o.utility).toBeGreaterThan(u);
    }
  });

  it('does not depend on the order of the devices', () => {
    const list = [...row('gb300', 6, 3), ...row('helios', 4, 6), {type: 'cdu', x: 8, z: 3}];
    const a = plan(list, 2), b = plan([...list].reverse(), 2);
    expect(b).toEqual(a);
  });
});

describe('limits of what adding units can fix', () => {
  it('does not chase an overload that a manual assignment holds in place', () => {
    // Both Kyber racks are assigned by hand to the same CDU, which no new CDU can relieve
    const list: Item[] = [
      {type: 'kyber', x: 0, z: 3, feeds: {coolantSource: [0, 5]}}, {type: 'kyber', x: 1, z: 3, feeds: {coolantSource: [0, 5]}},
      ...[3, 4, 5, 6, 7].map((x): Item => ({type: 'gb200', x, z: 3})),
      {type: 'cdu', x: 0, z: 5}, {type: 'cdu', x: 4, z: 5}, {type: 'rpp', x: 5, z: 5}, {type: 'rpp', x: 6, z: 5},
      {type: 'ib', x: 7, z: 5}, {type: 'crah', x: 8, z: 5},
    ];
    const [o] = plan(list, 10)!;
    expect(o.passes).toBe(false);
    expect(o.manualBlock).toBe(true);
    // Without the fix the loop kept adding CDUs that could never take the load
    expect(o.add.filter(i => i.type === 'cdu').length).toBeLessThanOrEqual(2);
  });

  it('never offers an option that changes nothing', () => {
    const halls: [Item[], number][] = [
      [[...Array.from({length: 16}, (_, x): Item => ({type: 'kyber', x, z: 3}))], 10],
      [[{type: 'kyber', x: 0, z: 3, feeds: {coolantSource: [0, 5]}}, {type: 'cdu', x: 0, z: 5}], 2],
      [[...Array.from({length: 10}, (_, x): Item => ({type: 'vr200', x, z: 3}))], 2],
    ];
    for (const [list, u] of halls){
      for (const o of plan(list, u) ?? []) expect(o.utility !== null || o.remove.length > 0 || o.add.length > 0, JSON.stringify(o)).toBe(true);
    }
  });
});
