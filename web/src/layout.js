// 布局格式：{u: 市电 MW, list: [[type, x, z], ...]}
export const PRESETS = {
  empty: {u: 2, list: []},
  gb200: {u: 2, list: [
    ...[4,5,6,7,8,9,10,11].map(x => ['gb200', x, 3]),
    ['cdu',4,5],['cdu',5,5],['ib',6,5],['ib',7,5],['rpp',8,5],['rpp',9,5],['crah',10,5],['crah',11,5]]},
  rubin: {u: 5, list: [
    ...[3,4,5,6,7,8,9,10,11,12].map(x => ['vr200', x, 3]),
    ['cdu',3,5],['cdu',4,5],['cdu',5,5],['rpp',6,5],['rpp',7,5],['rpp',8,5],
    ['ib',9,5],['ib',10,5],['ib',11,5],['crah',12,5],['crah',13,5],['stor',2,3]]},
};

const KEY = 'dchall.v1';

export function saveLayout(p){
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
}
export function restoreLayout(){
  try { const raw = localStorage.getItem(KEY); if (raw){ const p = JSON.parse(raw); if (p && Array.isArray(p.list)) return p; } } catch (e) {}
  return null;
}
