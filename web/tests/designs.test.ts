import {describe, expect, it} from 'vitest';
import {delta, summarize} from '../src/designs.ts';
import {CAT} from '../src/catalog.ts';
import {PRESETS} from '../src/layout.ts';
import {compute} from '../src/sim.ts';
import {toItems} from '../src/edit.ts';
import {DEFAULT_LOAD, DEFAULT_PRICE, annualEnergy} from '../src/energy.ts';
import type {Layout} from '../src/types.ts';

const ENERGY = {price: DEFAULT_PRICE, load: DEFAULT_LOAD};

describe('design summary', () => {
  it('carries the same figures as the capacity model and the energy estimate', () => {
    const s = summarize(PRESETS.gb200, CAT, ENERGY);
    const t = compute(toItems(PRESETS.gb200.list), CAT, PRESETS.gb200.u);
    expect(s).toMatchObject({gpus: 576, devices: PRESETS.gb200.list.length, itKw: t.it, pue: t.pue, capexM: t.capex, utilityMw: 2, problems: []});
    expect(s.racks).toEqual([['gb200', 8]]);
    expect(s.costUsd).toBeCloseTo(annualEnergy(t, ENERGY).cost);
    // The preset passes but is not N+1
    expect(s.spof).toBeGreaterThan(0);
    expect(summarize(PRESETS.gb200n1, CAT, ENERGY).spof).toBe(0);
  });

  it('says why a hall cannot power on, and skips redundancy then', () => {
    const bare: Layout = {u: 2, list: [0, 1, 2].map(x => ['gb200', x, 3])};
    const s = summarize(bare, CAT, ENERGY);
    expect(s.problems).toEqual(expect.arrayContaining(['dist', 'liquid', 'network']));
    expect(s.spof).toBeNull();
  });

  it('counts every phase and ignores device types it does not know', () => {
    const l: Layout = {u: 2, list: [['gb200', 0, 3], ['gb200', 1, 3, {phase: 2}], ['constructor', 2, 3]]};
    expect(summarize(l, CAT, ENERGY)).toMatchObject({devices: 2, gpus: 144});
  });

  it('an empty hall has no PUE, energy or cost', () => {
    expect(summarize(PRESETS.empty, CAT, ENERGY)).toMatchObject({devices: 0, pue: 0, energyMWh: 0, costUsd: 0, problems: [], spof: null});
  });
});

describe('delta', () => {
  const a = summarize(PRESETS.gb200, CAT, ENERGY), b = summarize(PRESETS.rubin, CAT, ENERGY);
  it('marks more GPUs and a lower PUE as better, and leaves power and cost neutral', () => {
    expect(delta(a, b, 'gpus').verdict).toBe(b.gpus > a.gpus ? 'better' : 'worse');
    expect(delta(a, b, 'pue').verdict).toBe(b.pue < a.pue ? 'better' : 'worse');
    expect(delta(a, b, 'itKw').verdict).toBe('neutral');
    expect(delta(a, a, 'costUsd')).toEqual({d: 0, verdict: 'same'});
    expect(delta(a, b, 'gpus').d).toBe(b.gpus - a.gpus);
  });
});
