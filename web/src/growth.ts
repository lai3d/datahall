// 增长规划：设备按部署阶段（phase，从 1 开始）分批上线，逐阶段累计检查容量，并估算还能加多少台机柜。纯函数，不依赖 DOM。
import {compute} from './sim.ts';
import {blockingReasons} from './redundancy.ts';
import type {Reason, ReasonKind} from './redundancy.ts';
import type {Totals} from './sim.ts';
import type {Catalog, Item} from './types.ts';

export interface PhaseResult {
  phase: number; count: number; gpus: number; itKw: number; facilityKw: number;
  util: Record<ReasonKind, number>; tightest: {kind: ReasonKind; ratio: number}; reasons: Reason[];
}

export const phaseOf = (it: {phase?: number}): number => it.phase || 1;

// 布局里出现过的阶段，升序；空布局返回 []
export const phasesIn = (items: {phase?: number}[]): number[] => [...new Set(items.map(phaseOf))].sort((a, b) => a - b);

// 五项容量的利用率（需求 / 容量）。容量为 0 且有需求时记为 Infinity，都为 0 时记为 0
export function utilization(s: Totals, utility: number): Record<ReasonKind, number>{
  const ratio = (need: number, cap: number): number => cap > 0 ? need / cap : need > 0 ? Infinity : 0;
  return {
    dist: ratio(s.it, s.dist),
    liquid: ratio(s.liqHeat, s.liqCap),
    air: ratio(s.airHeat, s.airCap),
    network: ratio(s.gpus, s.ports),
    utility: ratio(s.facility, utility * 1000),
  };
}

// 逐阶段累计：第 p 阶段包含阶段 ≤ p 的全部设备。
// 返回 [{phase, count, gpus, itKw, facilityKw, util, tightest: {kind, ratio}, reasons}]
export function growthPlan(items: Item[], CAT: Catalog, utility: number): PhaseResult[]{
  return phasesIn(items).map(phase => {
    const upTo = items.filter(it => phaseOf(it) <= phase);
    const s = compute(upTo, CAT, utility);
    const util = utilization(s, utility);
    const [kind, ratio] = (Object.entries(util) as [ReasonKind, number][]).reduce((a, b) => b[1] > a[1] ? b : a);
    return {phase, count: upTo.length, gpus: s.gpus, itKw: s.it, facilityKw: s.facility, util,
      tightest: {kind, ratio}, reasons: blockingReasons(upTo, CAT, utility)};
  });
}

// 在现有设备基础上还能加几台 type 类型的机柜，以及先用完的是哪一项。
// 只看全机房总量（配电、液冷、风冷、网络端口、市电），不看地板空位和逐台 CDU / RPP 的就近分配。
// 已经超了的项返回 0 台。type 不消耗任何一项时 limit 为 null、count 为 Infinity
export function headroom(items: Item[], CAT: Catalog, utility: number, type: string): {limit: ReasonKind | null; count: number}{
  const s = compute(items, CAT, utility), t = CAT[type];
  const kw = t.kw || 0, liq = t.liq || 0;
  // 每加一台的需求增量，和 sim.ts 的 PUE 公式一致：IT + 自耗 + 液冷热量×0.08 + 风冷热量×0.30 + IT×0.05
  const need: Record<ReasonKind, number> = {
    dist: kw,
    liquid: kw * liq,
    air: kw * (1 - liq),
    network: t.gpus || 0,
    utility: kw + (t.ovh || 0) + kw * liq * .08 + kw * (1 - liq) * .30 + kw * .05,
  };
  const left: Record<ReasonKind, number> = {
    dist: s.dist - s.it,
    liquid: s.liqCap - s.liqHeat,
    air: s.airCap - s.airHeat,
    network: s.ports - s.gpus,
    utility: utility * 1000 - s.facility,
  };
  let best: {limit: ReasonKind | null; count: number} = {limit: null, count: Infinity};
  for (const kind of Object.keys(need) as ReasonKind[]){
    if (!(need[kind] > 0)) continue;
    const n = Math.max(0, Math.floor(left[kind] / need[kind] + 1e-9));
    if (n < best.count) best = {limit: kind, count: n};
  }
  return best;
}
