import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.ts';
import {GRID, keyOf} from '../src/grid.ts';
import {toItems} from '../src/edit.ts';
import {blockingReasons, singlePointsOfFailure} from '../src/redundancy.ts';
import {growthPlan} from '../src/growth.ts';
import {planRepair} from '../src/repair.ts';
import {generateLayout} from '../src/goal.ts';
import {SCENARIO_IDS, isDone, scenarioContext, scenarioResult, startLayout} from '../src/scenarios.ts';
import type {Item} from '../src/types.ts';

const start = (id: (typeof SCENARIO_IDS)[number]) => {
  const layout = startLayout(id, CAT, GRID);
  return {layout, items: toItems(layout.list)};
};
const ctx = (items: Item[], u: number, powered = false) => scenarioContext(items, items, CAT, u, powered);
// Everything a user could do from the panel: let the repair suggestion finish the hall
const repaired = (items: Item[], u: number) => {
  const [o] = planRepair(items, CAT, u, new Set(items.map(i => keyOf(i.x, i.z))), GRID) ?? [];
  return o ? [...items.filter(i => !o.remove.includes(i)), ...o.add] : items;
};

describe('scenario starting halls', () => {
  it.each(SCENARIO_IDS)('%s: sits on the grid and is not finished yet', id => {
    const {layout, items} = start(id);
    expect(items.length).toBeGreaterThan(0);
    const keys = items.map(i => keyOf(i.x, i.z));
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of items) expect(CAT[i.type] && i.x >= 0 && i.x < GRID.GW && i.z >= 0 && i.z < GRID.GD).toBeTruthy();
    expect(isDone(id, ctx(items, layout.u), CAT, GRID)).toBe(false);
  });

  it('powerOn starts with racks that cannot power on', () => {
    const {items, layout} = start('powerOn');
    expect(blockingReasons(items, CAT, layout.u).map(r => r.kind)).toContain('dist');
  });

  it('sameFeed starts with a GB200 hall that passes on its feed', () => {
    const {items, layout} = start('sameFeed');
    expect(blockingReasons(items, CAT, layout.u)).toEqual([]);
    expect(items.filter(i => i.type === 'gb200').length).toBeGreaterThan(8);
  });

  it('redundancy starts with a hall that passes but has single points of failure', () => {
    const {items, layout} = start('redundancy');
    expect(blockingReasons(items, CAT, layout.u)).toEqual([]);
    expect(singlePointsOfFailure(items, CAT, layout.u)!.length).toBeGreaterThan(0);
  });

  it('phases starts with phase 1 passing and phase 2 failing', () => {
    const {items, layout} = start('phases');
    const plan = growthPlan(items, CAT, layout.u);
    expect(plan).toHaveLength(2);
    expect(plan[0].reasons).toEqual([]);
    expect(plan[1].reasons.length).toBeGreaterThan(0);
  });
});

describe('scenarios can be finished from the panel', () => {
  it('powerOn: add the missing units and power on', () => {
    const {items, layout} = start('powerOn');
    const fixed = repaired(items, layout.u);
    expect(isDone('powerOn', ctx(fixed, layout.u, false), CAT, GRID)).toBe(false);   // powering on is the point
    expect(isDone('powerOn', ctx(fixed, layout.u, true), CAT, GRID)).toBe(true);
  });

  it('sameFeed: generate the Vera Rubin hall on the same feed', () => {
    const {layout} = start('sameFeed');
    const rubin = generateLayout({type: 'vr200', gpus: 99999, utility: layout.u, n1: false}, CAT, GRID)!.list;
    expect(isDone('sameFeed', ctx(rubin, layout.u), CAT, GRID)).toBe(true);
    // Fewer GPUs on the same feed, which is the lesson
    expect(scenarioResult(rubin, CAT, layout.u).gpus).toBeLessThan(scenarioResult(toItems(layout.list), CAT, layout.u).gpus);
  });

  it('redundancy: an N+1 hall finishes it, one more CDU alone does not', () => {
    const {items, layout} = start('redundancy');
    const oneMoreCdu = [...items, {type: 'cdu', x: 12, z: 5}];
    expect(isDone('redundancy', ctx(oneMoreCdu, layout.u), CAT, GRID)).toBe(false);
    const n1 = generateLayout({type: 'gb200', gpus: 8 * 72, utility: layout.u, n1: true}, CAT, GRID)!.list;
    expect(isDone('redundancy', ctx(n1, layout.u), CAT, GRID)).toBe(true);
  });

  it('phases: adding the support phase 2 needs finishes it', () => {
    const {items, layout} = start('phases');
    const fixed = repaired(items, layout.u);
    expect(isDone('phases', ctx(fixed, layout.u), CAT, GRID)).toBe(true);
    // Deleting the phase 2 racks does not count as finishing it
    expect(isDone('phases', ctx(fixed.filter(i => !(i.type === 'gb200' && i.z === 4)), layout.u), CAT, GRID)).toBe(false);
  });
});

describe('scenarios cannot be finished by emptying the hall', () => {
  const withoutRacks = (id: (typeof SCENARIO_IDS)[number]) => {
    const {layout, items} = start(id);
    return {layout, items: items.filter(i => !CAT[i.type].gpus)};
  };

  it('redundancy: no racks means no single point of failure, and that is not finishing it', () => {
    const {layout, items} = withoutRacks('redundancy');
    expect(singlePointsOfFailure(items, CAT, layout.u)).toEqual([]);
    expect(isDone('redundancy', ctx(items, layout.u), CAT, GRID)).toBe(false);
  });

  it('phases: deleting the phase 1 racks does not finish it either', () => {
    const {items, layout} = start('phases');
    const onlyPhase2 = items.filter(i => !(CAT[i.type].gpus && (i.phase ?? 1) === 1));
    expect(isDone('phases', ctx(onlyPhase2, layout.u), CAT, GRID)).toBe(false);
  });

  it('sameFeed: the lesson needs the same feed and a full Rubin hall', () => {
    const feed = startLayout('sameFeed', CAT, GRID).u;
    const onAnotherFeed = generateLayout({type: 'vr200', gpus: 99999, utility: 10, n1: false}, CAT, GRID)!.list;
    expect(isDone('sameFeed', ctx(onAnotherFeed, 10), CAT, GRID)).toBe(false);
    const leftovers = start('sameFeed').items.filter(i => !CAT[i.type].gpus);
    const oneRack = [...leftovers, {type: 'vr200', x: 0, z: 3}];
    expect(isDone('sameFeed', ctx(oneRack, feed), CAT, GRID)).toBe(false);
    const full = generateLayout({type: 'vr200', gpus: 99999, utility: feed, n1: false}, CAT, GRID)!.list;
    expect(isDone('sameFeed', ctx(full, feed), CAT, GRID)).toBe(true);
  });
});
