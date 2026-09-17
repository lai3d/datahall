import type {Entry, Layout} from './types.ts';

const row = (type: string, xs: number[], z: number): Entry[] => xs.map(x => [type, x, z]);

// 布局格式：{u: 市电 MW, list: [[type, x, z], ...]}
export const PRESETS: Record<'empty' | 'gb200' | 'gb200n1' | 'rubin', Layout> = {
  empty: {u: 2, list: []},
  gb200: {u: 2, list: [
    ...row('gb200', [4,5,6,7,8,9,10,11], 3),
    ['cdu',4,5],['cdu',5,5],['ib',6,5],['ib',7,5],['rpp',8,5],['rpp',9,5],['crah',10,5],['crah',11,5]]},
  // 同样 8 柜 GB200，设施各 3 台：任意一台 CDU、RPP、IB 或空调故障，机房仍满足容量检查（redundancy.ts）
  gb200n1: {u: 2, list: [
    ...row('gb200', [4,5,6,7,8,9,10,11], 3),
    ...[0, 1, 2].flatMap(k => ['cdu', 'rpp', 'ib', 'crah'].map((t, j): Entry => [t, 2 + k * 4 + j, 5]))]},
  // 设施按“CDU、RPP、IB、空调”四个一组循环摆放，每台 CDU、RPP 就近分到的负载都在容量以内（supply.ts 逐台检查）
  rubin: {u: 5, list: [
    ...row('vr200', [3,4,5,6,7,8,9,10,11,12], 3),
    ['cdu',2,5],['rpp',3,5],['ib',4,5],['crah',5,5],['cdu',6,5],['rpp',7,5],['ib',8,5],['crah',9,5],
    ['cdu',10,5],['rpp',11,5],['ib',12,5],['stor',13,3]]},
};
export type PresetName = keyof typeof PRESETS;

const KEY = 'dchall.v1';

export function saveLayout(p: Layout): void{
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
}
export function restoreLayout(): Layout | null{
  try { const raw = localStorage.getItem(KEY); if (raw){ const p = JSON.parse(raw); if (p && Array.isArray(p.list)) return p; } } catch (e) {}
  return null;
}
