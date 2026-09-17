// 按设备的容量检查：每台 CDU、RPP 按拓扑（grid.ts 的 supplyLinks，就近分配）分到的负载和自身容量比较。
// sim.ts 的 compute() 只看全机房总量，总量够时某一台仍可能超载。纯函数，不依赖 DOM。
// 只在网页版使用：compute() 是和 Unity 共用的契约（spec/capacity-cases.json），这里不改它。
import {supplyLinks} from './grid.ts';
import {fmt} from './sim.ts';
import {tr, loc} from './i18n.ts';
import type {Links} from './grid.ts';
import type {Totals, Issue} from './sim.ts';
import type {Catalog, CatalogItem, FeedField, Item} from './types.ts';

export type SupplyKind = 'cdu' | 'rpp';
export interface Supply<T extends Item = Item> {kind: SupplyKind; loadKw: number; capacityKw: number; consumers: T[]; overloaded: boolean}
export interface Loads<T extends Item = Item> {
  supplies: Map<T, Supply<T>>;
  links: Map<T, Links<T>>;
  unconnected: {item: T; needs: SupplyKind}[];
}

// 每种供给设备：从哪个拓扑字段找消费者、消费者的负载、自身容量字段、提示用的名称
const KINDS: Record<SupplyKind, {link: FeedField; load: (t: CatalogItem) => number; capacity: 'liqCool' | 'dist'; label: string; message: 'overloadCdu' | 'overloadRpp'}> = {
  cdu: {link: 'coolantSource', load: t => (t.kw || 0) * (t.liq || 0), capacity: 'liqCool', label: 'CDU', message: 'overloadCdu'},
  rpp: {link: 'powerFeed', load: t => t.kw || 0, capacity: 'dist', label: 'RPP', message: 'overloadRpp'},
};
const KIND_IDS = Object.keys(KINDS) as SupplyKind[];
const isSupplyKind = (type: string): type is SupplyKind => type in KINDS;
const MAX_LISTED = 3;

// list：[{type, x, z}]。返回
//   supplies：Map(供给设备 → {kind, loadKw, capacityKw, consumers, overloaded})
//   links：Map(设备 → {coolantSource, powerFeed})
//   unconnected：需要液冷或供电、但机房里没有对应供给设备的设备 [{item, needs: 'cdu' | 'rpp'}]
export function supplyLoads<T extends Item>(list: T[], CAT: Catalog): Loads<T>{
  const placed = list.filter(i => CAT[i.type]);
  const links = supplyLinks(placed, CAT);
  const supplies = new Map<T, Supply<T>>();
  for (const it of placed){
    if (isSupplyKind(it.type)) supplies.set(it, {kind: it.type, loadKw: 0, capacityKw: CAT[it.type][KINDS[it.type].capacity] || 0, consumers: [], overloaded: false});
  }
  const unconnected: Loads<T>['unconnected'] = [];
  for (const it of placed){
    const t = CAT[it.type];
    for (const id of KIND_IDS){
      const kind = KINDS[id], load = kind.load(t);
      if (!(load > 0)) continue;
      const source = links.get(it)![kind.link];
      if (!source){ unconnected.push({item: it, needs: id}); continue; }
      const s = supplies.get(source)!;
      s.loadKw += load;
      s.consumers.push(it);
    }
  }
  for (const s of supplies.values()) s.overloaded = s.loadKw > s.capacityKw + 1e-9;
  return {supplies, links, unconnected};
}

// 需要报告的超载设备 [[item, supply], ...]，按排、列排序。某种资源的全机房总量已经不够时
// （compute 里已有“配电不足”“液冷不足”），这种设备不再逐台列出，避免重复
export function reportedOverloads<T extends Item>(loads: Loads<T>, totals: Totals, kind: SupplyKind): [T, Supply<T>][]{
  const globalShort: Record<SupplyKind, boolean> = {cdu: totals.liqHeat > totals.liqCap, rpp: totals.it > totals.dist};
  if (globalShort[kind]) return [];
  return [...loads.supplies].filter(([, s]) => s.kind === kind && s.overloaded)
    .sort(([a], [b]) => (a.z - b.z) || (a.x - b.x));
}

export function supplyIssues(loads: Loads, totals: Totals): Issue[]{
  const issues: Issue[] = [];
  for (const id of KIND_IDS){
    const kind = KINDS[id], over = reportedOverloads(loads, totals, id);
    over.slice(0, MAX_LISTED).forEach(([it, s]) => issues.push({lvl: 'bad',
      txt: tr(kind.message, {loc: loc(it.x, it.z), n: s.consumers.length, load: fmt(s.loadKw), cap: fmt(s.capacityKw)})}));
    if (over.length > MAX_LISTED) issues.push({lvl: 'bad', txt: tr('overloadMore', {n: over.length - MAX_LISTED, label: kind.label})});
  }
  return issues;
}
