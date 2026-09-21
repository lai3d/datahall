import {describe, expect, it} from 'vitest';
import {planFabric, hallFabric, DEFAULT_FABRIC, IN_RACK_M, CABLE_LABEL} from '../src/fabric.ts';
import {CABLES, CAT} from '../src/catalog.ts';
import type {Item} from '../src/types.ts';

const plan = (endpoints: number, radix = 144, oversubscription = 1, rails = 1) => planFabric({endpoints, radix, oversubscription, rails});

describe('fat-tree arithmetic', () => {
  it('connects nothing when there is nothing to connect', () => {
    expect(plan(0).tiers).toBe(0);
    expect(plan(10, 0).tiers).toBe(0);
  });

  it('uses one switch while every endpoint fits on it', () => {
    expect(plan(144)).toMatchObject({tiers: 1, leaves: 1, spines: 0, switches: 1, endpointLinks: 144});
  });

  it('carries k²/2 endpoints non-blocking in two tiers (10,368 at radix 144)', () => {
    const p = plan(144 * 144 / 2);
    expect(p).toMatchObject({tiers: 2, leaves: 144, spines: 72, downPerLeaf: 72, upPerLeaf: 72, maxTwoTier: 10368});
    expect(p.uplinks).toBe(144 * 72);
    // Every spine port is used exactly once
    expect(p.spines * 144).toBe(p.uplinks);
  });

  it('goes to three tiers one endpoint past the two-tier limit', () => {
    const p = plan(10369);
    expect(p.tiers).toBe(3);
    expect(p.cores).toBeGreaterThan(0);
  });

  it('carries up to k³/4 in three tiers without running out of core ports', () => {
    const k = 16, p = plan(k ** 3 / 4, k);
    expect(p.tiers).toBe(3);
    expect(p.leaves).toBe(k * k / 2);
    expect(p.spines).toBe(k * k / 2);
    expect(p.cores).toBe(k * k / 4);
  });

  it('trades uplinks for endpoint ports when oversubscribed', () => {
    const p = plan(96 * 11, 144, 2);
    expect(p).toMatchObject({leaves: 11, downPerLeaf: 96, upPerLeaf: 48});
    expect(p.maxTwoTier).toBe(96 * 144);
    // Leaves share the endpoints evenly and take only the uplinks they need
    expect(plan(1000, 144, 2)).toMatchObject({leaves: 11, downPerLeaf: 91, upPerLeaf: 46});
  });

  it('gives each rail its own leaves, which can cost a leaf a rail', () => {
    // 576 endpoints on 4 rails: 144 per rail, 72 per leaf, so two leaves per rail either way
    expect(plan(576, 144, 1, 4).leaves).toBe(8);
    // 600 endpoints: 150 per rail needs three leaves per rail (12), where a plain fabric needs ceil(600 / 72) = 9
    expect(plan(600, 144, 1, 4).leaves).toBe(12);
    expect(plan(600).leaves).toBe(9);
    // Rails always need spines, even when one switch would hold everything
    expect(plan(100, 144, 1, 4)).toMatchObject({tiers: 2, leaves: 4});
  });
});

describe('cable runs', async () => {
  const {runLength, classify, tally} = await import('../src/fabric.ts');
  const g = {cellWidthM: .6, cellDepthM: 1.2, riseM: 1, slackM: .5};
  const classes = [{id: 'dac', maxM: 3}, {id: 'acc', maxM: 5}, {id: 'mmf', maxM: 50}];

  it('goes up, along the tray in row and column steps, and down again', () => {
    expect(runLength({x: 0, z: 0}, {x: 0, z: 0}, g)).toBeCloseTo(2.5);
    expect(runLength({x: 0, z: 0}, {x: 5, z: 2}, g)).toBeCloseTo(3 + 2.4 + 2.5);
  });

  it('takes the shortest-reach class that covers the run, including its exact limit', () => {
    expect(classify(3, classes)).toBe('dac');
    expect(classify(3.01, classes)).toBe('acc');
    expect(classify(49, classes)).toBe('mmf');
    expect(classify(51, classes)).toBeNull();
  });

  it('counts cables per class and flags runs beyond every class', () => {
    const t = tally([{lengthM: 2.5, n: 72}, {lengthM: 4, n: 72}, {lengthM: 60, n: 2}, {lengthM: 1, n: 0}], classes);
    expect(t.byClass).toEqual({dac: 72, acc: 72, mmf: 0});
    expect(t.beyond).toBe(2);
    expect(t.longestM).toBe(60);
  });
});

// NVIDIA DGX SuperPOD reference designs, table 3 of each (spec/catalog.json sources): leaves and spines per plane
describe('matches NVIDIA reference designs', () => {
  const su = (sus: number, t: 'gb300' | 'vr200') => {
    const c = CAT[t]!, planes = c.planes ?? 1;
    return plan(sus * 8 * c.nics! / planes, 144, 1, c.rails! / planes);
  };
  it('GB300: 8 leaves per SU, 8 / 18 / 36 / 72 spines at 2 / 4 / 8 / 16 SUs', () => {
    expect([1, 2, 4, 8, 16].map(n => su(n, 'gb300').leaves)).toEqual([8, 16, 32, 64, 128]);
    expect([2, 4, 8, 16].map(n => su(n, 'gb300').spines)).toEqual([8, 18, 36, 72]);
    expect(su(16, 'gb300').tiers).toBe(2);
  });
  it('Vera Rubin: per plane 16 / 32 / 64 / 144 leaves and 18 / 36 / 72 spines at 4 / 8 / 18 SUs', () => {
    expect([2, 4, 8, 18].map(n => su(n, 'vr200').leaves)).toEqual([16, 32, 64, 144]);
    // The design lists 9 spines at 2 SUs; the even-spread rule gives 8, which also has enough ports
    expect([2, 4, 8, 18].map(n => su(n, 'vr200').spines)).toEqual([8, 18, 36, 72]);
  });
});

describe('the hall', () => {
  const row = (type: string, z: number, n: number, x0 = 0): Item[] => Array.from({length: n}, (_, i) => ({type, x: x0 + i, z}));
  const fab = (items: Item[], opts = DEFAULT_FABRIC) => hallFabric(items, CAT, CABLES, opts);

  it('one scalable unit of GB300 needs 12 switches, six IB racks, where the port check asks for two', () => {
    const f = fab([...row('gb300', 2, 8), ...row('ib', 4, 2)]);
    expect(f.modeled).toMatchObject([{type: 'gb300', racks: 8, planes: 1, rails: 4, endpoints: 576, switches: 12}]);
    expect(f.gpuPorts).toBe(576);
    expect(f.ibRacks).toBe(2);
    expect(f.ibRacksNeeded).toBe(6);
    expect(f.switchPorts / f.endpoints).toBe(3);
    // 4 of the 12 switches have a slot; the rest of their cables are counted, not measured
    expect(f.nicRuns + f.switchRuns + f.unplaced).toBe(576 + 576);
    expect(f.unplaced).toBeGreaterThan(0);
  });

  it('every cable has a class when every switch has a rack, and runs between racks are optical at 800G', () => {
    const f = fab([...row('gb300', 2, 8), ...row('ib', 4, 6)]);
    expect(f.unplaced).toBe(0);
    expect(f.beyond).toBe(0);
    expect(f.nicRuns).toBe(576);
    expect(f.switchRuns).toBe(576);
    const total = Object.values(f.byClass).reduce((a, b) => a + b, 0);
    expect(total).toBe(1152);
    // Active copper to a NIC reaches 2 m: nothing between two racks is that short once it rises to the tray
    expect(f.byClass.acc).toBe(0);
    expect(f.byClass.dr4).toBeGreaterThan(0);
    expect(f.longestM).toBeLessThan(40);
  });

  it('links between two switches in one rack use active copper', () => {
    // 1 GB300 rack: 72 NICs on 4 rails → 4 leaves of 18 NICs and 18 uplinks each, and 1 spine
    expect(fab(row('gb300', 2, 1)).modeled[0]!.plan).toMatchObject({leaves: 4, downPerLeaf: 18, upPerLeaf: 18, spines: 1});
    // 3 racks, plain: 3 leaves and 2 spines; the second IB rack holds the third leaf and the first spine
    const f = fab([...row('gb300', 2, 3), ...row('ib', 4, 3)], {...DEFAULT_FABRIC, railOptimized: false});
    expect(f.modeled[0]!.plan).toMatchObject({leaves: 3, spines: 2});
    expect(IN_RACK_M).toBeLessThanOrEqual(CABLES.find(c => c.id === 'aec')!.maxM);
    expect(f.byClass.aec).toBeGreaterThan(0);
  });

  it('Vera Rubin connects each GPU to two planes', () => {
    const f = fab([...row('vr200', 2, 8), ...row('ib', 4, 8)]);
    expect(f.modeled[0]).toMatchObject({planes: 2, rails: 4, endpoints: 1152, switches: 24});
  });

  it('a plain leaf/spine can need fewer leaves than rails do', () => {
    const items = [...row('gb300', 2, 3)];
    const rails = fab(items), plain = fab(items, {...DEFAULT_FABRIC, railOptimized: false});
    expect(rails.modeled[0]!.plan.leaves).toBe(4);
    expect(plain.modeled[0]!.plan).toMatchObject({tiers: 2, leaves: 3});
  });

  it('oversubscription trades spines for endpoint ports', () => {
    const items = row('gb300', 2, 8);
    expect(fab(items, {railOptimized: true, oversubscription: 2}).switchesNeeded).toBeLessThan(fab(items).switchesNeeded);
  });

  it('says why a rack type is left out', () => {
    const f = fab([...row('gb200', 0, 2), ...row('helios', 1, 1), ...row('kyber', 2, 1), ...row('dgx', 3, 1)]);
    expect(f.modeled).toEqual([]);
    expect(f.skipped.map(s => [s.type, s.reason])).toEqual([['gb200', 'quantum2'], ['dgx', 'quantum2'], ['kyber', 'unsourced'], ['helios', 'ethernet']]);
    expect(f.gpuPorts).toBe(72 * 2 + 72 + 144 + 32);
  });

  it('does not depend on list order', () => {
    const items = [...row('gb300', 2, 8), ...row('ib', 4, 4), ...row('vr200', 6, 4)];
    expect(fab([...items].reverse())).toEqual(fab(items));
  });
});

it('every cable class has a label', () => {
  for (const c of CABLES) expect(CABLE_LABEL[c.id], c.id).toBeDefined();
});
