// 机房网格：16 列 × 10 排，格子 0.6m × 1.2m
export const GRID = {GW: 16, GD: 10, CX: 0.6, CZ: 1.2};

export const keyOf = (x, z) => x + ',' + z;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 最近的供给设备（CDU / RPP），跨排距离加倍，倾向同排就近
export const nearest = (it, arr) => arr.reduce((b, a) => {
  const d = Math.hypot(a.x - it.x, (a.z - it.z) * 2); return !b || d < b.d ? {a, d} : b; }, null);

// 设备名：第 z+1 排第 x+1 列，例如 R04_C05（USD prim 名和 layout.json 共用）
export const equipmentName = it => `R${String(it.z + 1).padStart(2, '0')}_C${String(it.x + 1).padStart(2, '0')}`;

// 两种供给关系：字段名 → 供给设备类型、哪些设备需要
export const FEEDS = {
  coolantSource: {type: 'cdu', needs: t => t.liq > 0},
  powerFeed: {type: 'rpp', needs: t => t.kw > 0},
};

// 供给关系：液冷设备接 CDU，有 IT 负载的设备接 RPP。默认接最近的一台；
// 设备上有手动指定（it.feeds = {coolantSource: [x, z], powerFeed: [x, z]}，都可省略）且那一格确实是对应的供给设备时，接指定的那台，
// 否则（被删、挪走、故障演练里拿掉）退回最近的。返回 Map(设备 → {coolantSource, powerFeed})，没有则为 null
export function supplyLinks(list, CAT){
  const pools = {coolantSource: list.filter(i => i.type === 'cdu'), powerFeed: list.filter(i => i.type === 'rpp')};
  const pick = (it, field) => {
    if (!FEEDS[field].needs(CAT[it.type])) return null;
    const want = it.feeds?.[field];
    const manual = want && pools[field].find(s => s.x === want[0] && s.z === want[1]);
    return manual || (nearest(it, pools[field])?.a ?? null);
  };
  return new Map(list.filter(i => CAT[i.type]).map(it => [it, {coolantSource: pick(it, 'coolantSource'), powerFeed: pick(it, 'powerFeed')}]));
}
