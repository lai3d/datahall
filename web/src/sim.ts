// 容量模型：配电、液冷、风冷、后端网络、市电，任一不满足不能通电
import {tr} from './i18n.ts';
import type {Catalog, Item} from './types.ts';

export interface Issue {lvl: 'bad' | 'warn' | 'ok'; txt: string}
// compute 的结果。字段名和 spec/capacity-cases.json 的 expected 对应（见 scripts/capacity-cases.ts）
export interface Totals {
  it: number; gpus: number; liqHeat: number; airHeat: number; liqCap: number; airCap: number;
  dist: number; ports: number; ovh: number; capex: number; future: boolean; dense: boolean;
  facility: number; pue: number; issues: Issue[]; blocking: boolean;
}

export function fmt(kw: number): string{ return kw >= 1000 ? (kw / 1000).toFixed(2) + ' MW' : Math.round(kw) + ' kW'; }

export function compute(list: Item[], CAT: Catalog, utility: number): Totals{
  const s: Totals = {it:0, gpus:0, liqHeat:0, airHeat:0, liqCap:0, airCap:0, dist:0, ports:0, ovh:0, capex:0, future:false, dense:false,
    facility:0, pue:0, issues:[], blocking:false};
  for (const i of list){
    const t = CAT[i.type], kw = t.kw || 0;
    s.it += kw; s.gpus += t.gpus || 0;
    s.liqHeat += kw * (t.liq || 0); s.airHeat += kw * (1 - (t.liq || 0));
    s.liqCap += t.liqCool || 0; s.airCap += t.airCool || 0;
    s.dist += t.dist || 0; s.ports += t.ports || 0; s.ovh += t.ovh || 0; s.capex += t.cap || 0;
    if (t.future) s.future = true;
    if (i.type === 'dgx') s.dense = true;
  }
  // 教学用简化 PUE：液冷热量 ×0.08、风冷热量 ×0.30 的制冷耗电，加 IT×0.05 的配电损耗
  const chiller = s.liqHeat * .08 + s.airHeat * .30;
  const losses = s.it * .05;
  s.facility = s.it + s.ovh + chiller + losses;
  s.pue = s.it ? s.facility / s.it : 0;
  const add = (lvl: Issue['lvl'], txt: string) => s.issues.push({lvl, txt});
  if (s.it > s.dist) add('bad', tr('issueDist', {need: fmt(s.it), cap: fmt(s.dist)}));
  if (s.liqHeat > s.liqCap) add('bad', tr('issueLiquid', {heat: fmt(s.liqHeat), cap: fmt(s.liqCap)}));
  if (s.airHeat > s.airCap) add('bad', tr('issueAir', {heat: fmt(s.airHeat), cap: fmt(s.airCap)}));
  if (s.gpus > s.ports) add('bad', tr('issueNetwork', {gpus: s.gpus, ports: s.ports}));
  if (s.facility > utility * 1000) add('bad', tr('issueUtility', {facility: fmt(s.facility), u: utility}));
  if (s.future) add('warn', tr('issueKyber'));
  if (s.dense) add('warn', tr('issueDgx'));
  s.blocking = s.issues.some(i => i.lvl === 'bad');
  return s;
}
