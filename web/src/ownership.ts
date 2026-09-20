// Simplified ownership estimate over three or five years, pure functions. Three terms only:
// hardware (the capex of the racks and support units in the hall, from sim.ts), electricity (energy.ts's annual cost repeated
// for every year) and an optional maintenance assumption as a share of hardware per year. Everything else a real total cost of
// ownership includes — the building, the power and cooling plant, networking beyond the racks, staff and the cost of money — is out.
// The sensitivity band matters more than the total: the operating assumptions are swept together to give a low and a high case.
import {annualEnergy, LOAD_RANGE, PRICE_RANGE} from './energy.ts';
import type {EnergyInputs} from './energy.ts';
import type {Totals} from './sim.ts';

export const YEAR_OPTIONS = [3, 5] as const;
export const DEFAULT_YEARS = 3;
// Maintenance and support as a share of hardware price per year. An assumption, not a sourced figure:
// vendor support contracts on enterprise hardware are commonly quoted in this range, and the user is expected to enter their own
export const DEFAULT_MAINT = .05;
export const MAINT_RANGE = [0, .25] as const;

// Sensitivity band, applied to the operating assumptions at the same time so the two cases bracket the plausible range.
// Price: industrial tariffs differ by more than this between regions, so ±30% is a floor, not a worst case.
// Load: the average load is an assumption to begin with. Overhead: cooling and loss coefficients are teaching values (sim.ts's PUE_FACTORS)
export const BANDS = {price: .30, load: .20, overhead: .25} as const;

export interface OwnershipInputs {years: number; maint: number}
export interface Ownership {
  years: number;
  hardware: number;      // USD, the hall's capex (catalog prices are in $M)
  electricity: number;   // USD over the whole period
  maintenance: number;   // USD over the whole period
  total: number;
  low: number; high: number;   // total with the operating assumptions at the low and high end of BANDS
}

const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(Math.max(v, lo), hi);

// Electricity cost for one year with the operating assumptions moved by dir (-1 low, 0 as entered, +1 high).
// The energy itself comes from annualEnergy; only the overhead share is rescaled here, which is what a different PUE would do
function yearCost(s: Totals, {price, load}: EnergyInputs, dir: number): number{
  const p = clamp(price * (1 + dir * BANDS.price), PRICE_RANGE);
  const e = annualEnergy(s, {price: p, load: clamp(load * (1 + dir * BANDS.load), LOAD_RANGE)});
  return (e.itMWh + e.overheadMWh * (1 + dir * BANDS.overhead)) * 1000 * p;
}

export function ownership(s: Totals, energy: EnergyInputs, {years, maint}: OwnershipInputs): Ownership{
  const hardware = s.capex * 1e6;
  const maintenance = hardware * maint * years;
  const fixed = hardware + maintenance;   // hardware prices are estimates too, but the band is about the operating assumptions
  const electricity = yearCost(s, energy, 0) * years;
  return {
    years, hardware, electricity, maintenance, total: fixed + electricity,
    low: fixed + yearCost(s, energy, -1) * years,
    high: fixed + yearCost(s, energy, 1) * years,
  };
}

// User-entered inputs come from form fields and localStorage: years must be one of the offered periods, maintenance is clamped
export function cleanOwnership(raw: {years?: unknown; maint?: unknown}): OwnershipInputs{
  const years = typeof raw.years === 'number' && (YEAR_OPTIONS as readonly number[]).includes(raw.years) ? raw.years : DEFAULT_YEARS;
  const maint = typeof raw.maint === 'number' && Number.isFinite(raw.maint) ? clamp(raw.maint, MAINT_RANGE) : DEFAULT_MAINT;
  return {years, maint};
}
