// 机房网格：16 列 × 10 排，格子 0.6m × 1.2m
export const GRID = {GW: 16, GD: 10, CX: 0.6, CZ: 1.2};

export const keyOf = (x, z) => x + ',' + z;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 最近的供给设备（CDU / RPP），跨排距离加倍，倾向同排就近
export const nearest = (it, arr) => arr.reduce((b, a) => {
  const d = Math.hypot(a.x - it.x, (a.z - it.z) * 2); return !b || d < b.d ? {a, d} : b; }, null);

// 设备名：第 z+1 排第 x+1 列，例如 R04_C05（USD prim 名和 layout.json 共用）
export const equipmentName = it => `R${String(it.z + 1).padStart(2, '0')}_C${String(it.x + 1).padStart(2, '0')}`;

// 供给关系：液冷设备接最近的 CDU，有 IT 负载的设备接最近的 RPP。返回 Map(设备 → {coolantSource, powerFeed})，没有则为 null
export function supplyLinks(list, CAT){
  const cdus = list.filter(i => i.type === 'cdu'), rpps = list.filter(i => i.type === 'rpp');
  return new Map(list.filter(i => CAT[i.type]).map(it => [it, {
    coolantSource: CAT[it.type].liq > 0 ? nearest(it, cdus)?.a ?? null : null,
    powerFeed: CAT[it.type].kw > 0 ? nearest(it, rpps)?.a ?? null : null,
  }]));
}
