// Annual energy and electricity cost, pure functions. Uses the same facility formula as sim.ts, split by what scales with load:
// IT power, cooling energy (proportional to heat) and distribution losses follow the average load,
// while equipment overhead (CDU pumps, in-row cooler fans) runs all year regardless.
import {PUE_FACTORS} from './sim.ts';
import type {Totals} from './sim.ts';

export const HOURS_PER_YEAR = 8760;
// Default electricity price: US industrial average for 2025, 8.62 ¢/kWh (US EIA, Electric Power Monthly, table 5.3).
// Excludes taxes, demand charges and fixed tariff components; users are expected to enter their own
export const DEFAULT_PRICE = 0.0862;
export const DEFAULT_LOAD = .8;   // assumed average load as a share of rated IT power
export const PRICE_RANGE = [0, 1] as const;   // $/kWh
export const LOAD_RANGE = [.1, 1] as const;

export interface EnergyInputs {price: number; load: number}
export interface AnnualEnergy {itMWh: number; overheadMWh: number; totalMWh: number; pue: number; cost: number}

export function annualEnergy(s: Totals, {price, load}: EnergyInputs): AnnualEnergy{
  const itKw = s.it * load;
  const scaled = (s.liqHeat * PUE_FACTORS.liquid + s.airHeat * PUE_FACTORS.air + s.it * PUE_FACTORS.losses) * load;
  const overheadKw = s.ovh + scaled;
  const itMWh = itKw * HOURS_PER_YEAR / 1000, overheadMWh = overheadKw * HOURS_PER_YEAR / 1000, totalMWh = itMWh + overheadMWh;
  return {itMWh, overheadMWh, totalMWh, pue: itMWh ? totalMWh / itMWh : 0, cost: totalMWh * 1000 * price};
}

// Shared formatting for the panel and the architecture report: GWh above a thousand MWh, and money in millions or thousands
export const fmtEnergy = (mwh: number): string => mwh >= 1000 ? (mwh / 1000).toFixed(mwh >= 10000 ? 1 : 2) + ' GWh' : Math.round(mwh).toLocaleString() + ' MWh';
export const fmtMoney = (usd: number): string => usd >= 1e9 ? '$' + (usd / 1e9).toFixed(2) + 'B'
  : usd >= 1e6 ? '$' + (usd / 1e6).toFixed(2) + 'M' : '$' + Math.round(usd / 1e3).toLocaleString() + 'K';

// User-entered inputs come from form fields and localStorage: clamp to the allowed range, fall back to defaults when not a number
export function cleanInputs(raw: {price?: unknown; load?: unknown}): EnergyInputs{
  const num = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : fallback;
  return {price: num(raw.price, PRICE_RANGE, DEFAULT_PRICE), load: num(raw.load, LOAD_RANGE, DEFAULT_LOAD)};
}
