// 分享链接：把机房布局编码进网址 hash，打开链接即可看到同一个机房。纯函数，不依赖 DOM。
// 格式：#layout=<版本>,<市电 MW>,<类型>:<列>.<排>-<列>.<排>,<类型>:...
// 例如 #layout=1,5,vr200:3.3-4.3,cdu:3.5   列、排从 0 开始，与 layout.json、USD 的 gridColumn/gridRow 一致。
// 只用 hash 不用查询参数：hash 不会发到服务器，静态托管也不需要任何配置。
import {keyOf} from './grid.js';

export const LINK_KEY = 'layout';
export const LINK_VERSION = 1;

// p：{u: 市电 MW, list: [[type, x, z], ...]}，返回不带 # 的 hash 内容；空机房返回空字符串
export function encodeLayout(p){
  if (!p.list.length) return '';
  const groups = new Map();
  for (const [type, x, z] of p.list){
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(`${x}.${z}`);
  }
  const parts = [...groups].map(([type, cells]) => `${type}:${cells.join('-')}`);
  return `${LINK_KEY}=${[LINK_VERSION, p.u, ...parts].join(',')}`;
}

// hash：location.hash（可带 #）。返回 null 表示 hash 里没有布局；否则返回 {u, list, warnings}
export function decodeLayout(hash, CAT, GRID){
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get(LINK_KEY);
  if (raw === null) return null;
  const warnings = [];
  const [version, utility, ...groups] = raw.split(',');
  if (Number(version) !== LINK_VERSION) return {u: 2, list: [], warnings: [`分享链接的版本 ${version} 不受支持，没有载入布局。`]};
  let u = Number(utility);
  if (!(u > 0 && Number.isFinite(u))){
    warnings.push('分享链接里的市电容量无效，按 2 MW 载入。');
    u = 2;
  }
  const list = [], seen = new Set();
  for (const group of groups){
    const [type, cells = ''] = group.split(':');
    if (!CAT[type]){ warnings.push(`分享链接里的设备类型 ${type} 不在当前目录里，已跳过。`); continue; }
    for (const cell of cells.split('-').filter(Boolean)){
      const m = cell.match(/^(\d+)\.(\d+)$/);
      if (!m){ warnings.push(`分享链接里的位置 ${type}:${cell} 格式不对，已跳过。`); continue; }
      const x = +m[1], z = +m[2];
      if (x >= GRID.GW || z >= GRID.GD){ warnings.push(`${CAT[type].name} 的位置（第 ${x + 1} 列第 ${z + 1} 排）超出网格，已跳过。`); continue; }
      if (seen.has(keyOf(x, z))){ warnings.push(`${CAT[type].name} 和其他设备占用同一格（第 ${x + 1} 列第 ${z + 1} 排），已跳过。`); continue; }
      seen.add(keyOf(x, z));
      list.push([type, x, z]);
    }
  }
  return {u, list, warnings};
}
