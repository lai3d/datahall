// 机房网格：16 列 × 10 排，格子 0.6m × 1.2m
export const GRID = {GW: 16, GD: 10, CX: 0.6, CZ: 1.2};

export const keyOf = (x, z) => x + ',' + z;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 最近的供给设备（CDU / RPP），跨排距离加倍，倾向同排就近
export const nearest = (it, arr) => arr.reduce((b, a) => {
  const d = Math.hypot(a.x - it.x, (a.z - it.z) * 2); return !b || d < b.d ? {a, d} : b; }, null);
