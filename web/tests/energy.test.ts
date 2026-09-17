import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.ts';
import {compute} from '../src/sim.ts';
import {toItems} from '../src/edit.ts';
import {PRESETS} from '../src/layout.ts';
import {DEFAULT_LOAD, DEFAULT_PRICE, HOURS_PER_YEAR, annualEnergy, cleanInputs} from '../src/energy.ts';

const totals = compute(toItems(PRESETS.gb200.list), CAT, 2);

describe('annual energy', () => {
  it('at full load matches the facility power from sim.ts running all year', () => {
    const e = annualEnergy(totals, {price: .1, load: 1});
    expect(e.totalMWh).toBeCloseTo(totals.facility * HOURS_PER_YEAR / 1000, 6);
    expect(e.itMWh).toBeCloseTo(totals.it * HOURS_PER_YEAR / 1000, 6);
    expect(e.pue).toBeCloseTo(totals.pue, 9);
    expect(e.cost).toBeCloseTo(e.totalMWh * 1000 * .1, 6);
  });

  it('keeps equipment overhead fixed at partial load, so the annual PUE rises', () => {
    expect(totals.ovh).toBeGreaterThan(0);
    const full = annualEnergy(totals, {price: .1, load: 1}), half = annualEnergy(totals, {price: .1, load: .5});
    expect(half.itMWh).toBeCloseTo(full.itMWh / 2, 6);
    expect(half.overheadMWh).toBeCloseTo((full.overheadMWh - totals.ovh * 8.76) / 2 + totals.ovh * 8.76, 6);
    expect(half.pue).toBeGreaterThan(full.pue);
  });

  it('is zero for an empty hall', () => {
    expect(annualEnergy(compute([], CAT, 2), {price: .1, load: 1})).toEqual({itMWh: 0, overheadMWh: 0, totalMWh: 0, pue: 0, cost: 0});
  });
});

describe('energy inputs', () => {
  it('clamps to the allowed range and falls back to defaults', () => {
    expect(cleanInputs({})).toEqual({price: DEFAULT_PRICE, load: DEFAULT_LOAD});
    expect(cleanInputs({price: 'x', load: NaN})).toEqual({price: DEFAULT_PRICE, load: DEFAULT_LOAD});
    expect(cleanInputs({price: -1, load: 5})).toEqual({price: 0, load: 1});
    expect(cleanInputs({price: .12, load: .05})).toEqual({price: .12, load: .1});
  });
});
