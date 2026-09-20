import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.ts';
import {compute} from '../src/sim.ts';
import {toItems} from '../src/edit.ts';
import {PRESETS} from '../src/layout.ts';
import {annualEnergy} from '../src/energy.ts';
import {BANDS, DEFAULT_MAINT, DEFAULT_YEARS, MAINT_RANGE, cleanOwnership, ownership} from '../src/ownership.ts';

const totals = compute(toItems(PRESETS.gb200.list), CAT, 2);
const energy = {price: .1, load: .8};

describe('ownership estimate', () => {
  it('is the hardware capex plus the annual electricity cost repeated for every year', () => {
    const o = ownership(totals, energy, {years: 3, maint: 0});
    expect(o.hardware).toBeCloseTo(totals.capex * 1e6, 6);
    expect(o.electricity).toBeCloseTo(annualEnergy(totals, energy).cost * 3, 6);
    expect(o.maintenance).toBe(0);
    expect(o.total).toBeCloseTo(o.hardware + o.electricity, 6);
    // Five years costs the same hardware and two more years of electricity
    const five = ownership(totals, energy, {years: 5, maint: 0});
    expect(five.hardware).toBe(o.hardware);
    expect(five.total - o.total).toBeCloseTo(o.electricity / 3 * 2, 6);
  });

  it('adds maintenance as a share of hardware per year', () => {
    const o = ownership(totals, energy, {years: 5, maint: .05});
    expect(o.maintenance).toBeCloseTo(o.hardware * .25, 6);
    expect(o.total).toBeCloseTo(o.hardware + o.maintenance + o.electricity, 6);
    expect(ownership(totals, energy, {years: 5, maint: 0}).total).toBeCloseTo(o.total - o.maintenance, 6);
  });

  it('brackets the total with a low and a high case of the operating assumptions', () => {
    const o = ownership(totals, energy, {years: 3, maint: .05});
    expect(o.low).toBeLessThan(o.total);
    expect(o.high).toBeGreaterThan(o.total);
    // Only electricity moves: hardware and maintenance are the same in every case
    const fixed = o.hardware + o.maintenance;
    expect(o.low).toBeGreaterThan(fixed);
    // The low case is the entered price and load moved down by the band, with less cooling overhead
    const low = annualEnergy(totals, {price: energy.price * (1 - BANDS.price), load: energy.load * (1 - BANDS.load)});
    expect(o.low - fixed).toBeCloseTo((low.itMWh + low.overheadMWh * (1 - BANDS.overhead)) * 1000 * energy.price * (1 - BANDS.price) * 3, 6);
    // A longer period widens the band, since only electricity is uncertain here
    const five = ownership(totals, energy, {years: 5, maint: .05});
    expect(five.high - five.low).toBeGreaterThan(o.high - o.low);
  });

  it('is zero for an empty hall', () => {
    const empty = compute([], CAT, 2);
    expect(ownership(empty, energy, {years: 5, maint: .1})).toEqual({years: 5, hardware: 0, electricity: 0, maintenance: 0, total: 0, low: 0, high: 0});
  });
});

describe('ownership inputs', () => {
  it('accepts only the offered periods and clamps maintenance', () => {
    expect(cleanOwnership({})).toEqual({years: DEFAULT_YEARS, maint: DEFAULT_MAINT});
    expect(cleanOwnership({years: 4, maint: 'x'})).toEqual({years: DEFAULT_YEARS, maint: DEFAULT_MAINT});
    expect(cleanOwnership({years: '5', maint: NaN})).toEqual({years: DEFAULT_YEARS, maint: DEFAULT_MAINT});
    expect(cleanOwnership({years: 5, maint: -1})).toEqual({years: 5, maint: MAINT_RANGE[0]});
    expect(cleanOwnership({years: 3, maint: 9})).toEqual({years: 3, maint: MAINT_RANGE[1]});
    expect(cleanOwnership({years: 5, maint: .08})).toEqual({years: 5, maint: .08});
  });
});
