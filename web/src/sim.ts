// Capacity model: distribution, liquid cooling, air cooling, backend network, utility; if any one falls short, power-on is blocked
import {tr, catName} from './i18n.ts';
import type {Catalog, CatalogItem, Item} from './types.ts';

export interface Issue {lvl: 'bad' | 'warn' | 'ok'; txt: string}
// Result of compute. Field names match expected in spec/capacity-cases.json (see scripts/capacity-cases.ts)
export interface Totals {
  it: number; gpus: number; liqHeat: number; airHeat: number; liqCap: number; airCap: number;
  dist: number; ports: number; ovh: number; capex: number; future: boolean; dense: boolean;
  facility: number; pue: number; issues: Issue[]; blocking: boolean;
}

// Teaching PUE coefficients: cooling energy per kW of liquid-cooled and air-cooled heat, and distribution losses per kW of IT.
// Shared with energy.ts, growth.ts and the methodology dialog, which quotes them; the Unity C# port keeps its own copy
// Version of the capacity and PUE model. Bump it when compute() or the PUE factors change; exports carry it so old results stay explainable
export const MODEL_VERSION = '1.0';

// Utility feeds offered in the panel, in MW
export const UTILITY_OPTIONS = [2, 5, 10];

export const PUE_FACTORS = {liquid: .08, air: .30, losses: .05} as const;

// Capacity comparisons: floating-point sums of the same devices differ in the last bits depending on the order they were added,
// and dragging reorders the list. A demand only counts as short when it is over capacity by more than this
export const KW_EPS = 1e-9;
export const over = (need: number, cap: number): boolean => need > cap + KW_EPS;

export function fmt(kw: number): string{ return kw >= 1000 ? (kw / 1000).toFixed(2) + ' MW' : Math.round(kw) + ' kW'; }

export function compute(list: Item[], CAT: Catalog, utility: number): Totals{
  let dense: CatalogItem | undefined;
  const s: Totals = {it:0, gpus:0, liqHeat:0, airHeat:0, liqCap:0, airCap:0, dist:0, ports:0, ovh:0, capex:0, future:false, dense:false,
    facility:0, pue:0, issues:[], blocking:false};
  for (const i of list){
    const t = CAT[i.type], kw = t.kw || 0;
    s.it += kw; s.gpus += t.gpus || 0;
    s.liqHeat += kw * (t.liq || 0); s.airHeat += kw * (1 - (t.liq || 0));
    s.liqCap += t.liqCool || 0; s.airCap += t.airCool || 0;
    s.dist += t.dist || 0; s.ports += t.ports || 0; s.ovh += t.ovh || 0; s.capex += t.cap || 0;
    if (t.future) s.future = true;
    if (t.airDense){ dense ??= t; s.dense = true; }   // s.dense stays in Totals: it is part of the contract with Unity (capacity-cases.json)
  }
  // Simplified teaching PUE: cooling power for liquid and air heat, plus distribution losses (PUE_FACTORS)
  const chiller = s.liqHeat * PUE_FACTORS.liquid + s.airHeat * PUE_FACTORS.air;
  const losses = s.it * PUE_FACTORS.losses;
  s.facility = s.it + s.ovh + chiller + losses;
  s.pue = s.it ? s.facility / s.it : 0;
  const add = (lvl: Issue['lvl'], txt: string) => s.issues.push({lvl, txt});
  if (over(s.it, s.dist)) add('bad', tr('issueDist', {need: fmt(s.it), cap: fmt(s.dist)}));
  if (over(s.liqHeat, s.liqCap)) add('bad', tr('issueLiquid', {heat: fmt(s.liqHeat), cap: fmt(s.liqCap)}));
  if (over(s.airHeat, s.airCap)) add('bad', tr('issueAir', {heat: fmt(s.airHeat), cap: fmt(s.airCap)}));
  if (s.gpus > s.ports) add('bad', tr('issueNetwork', {gpus: s.gpus, ports: s.ports}));
  if (over(s.facility, utility * 1000)) add('bad', tr('issueUtility', {facility: fmt(s.facility), u: utility}));
  if (s.future) add('warn', tr('issueKyber'));
  if (dense) add('warn', tr('issueAirDense', {name: catName(dense), kw: dense.kw || 0}));
  s.blocking = s.issues.some(i => i.lvl === 'bad');
  return s;
}
