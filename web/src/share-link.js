// 分享链接：把机房布局编码进网址 hash，打开链接即可看到同一个机房。纯函数，不依赖 DOM。
// 格式：#layout=<版本>,<市电 MW>,<类型>:<列>.<排>-<列>.<排>,<类型>:...
// 例如 #layout=1,5,vr200:3.3-4.3,cdu:3.5   列、排从 0 开始，与 layout.json、USD 的 gridColumn/gridRow 一致。
// 版本 2 在后面多出手动指定的供给设备：@c:<列>.<排>_<CDU 列>.<CDU 排>-...（冷却液）、@p:...（配电）。
// 没有手动指定时仍然编码成版本 1，已经发出去的链接和旧页面都不受影响
// 只用 hash 不用查询参数：hash 不会发到服务器，静态托管也不需要任何配置。
import {keyOf} from './grid.js';
import {tr, loc, catName} from './i18n.js';
import {FEEDS} from './grid.js';
import {setFeed} from './feeds.js';

export const LINK_KEY = 'layout';
export const LINK_VERSION = 2;   // 最新版本；解码支持 1 和 2
const FEED_TAGS = {coolantSource: '@c', powerFeed: '@p'};

// p：{u: 市电 MW, list: [[type, x, z, feeds?], ...]}，返回不带 # 的 hash 内容；空机房返回空字符串
export function encodeLayout(p){
  if (!p.list.length) return '';
  const groups = new Map();
  const feeds = {coolantSource: [], powerFeed: []};
  for (const [type, x, z, f] of p.list){
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(`${x}.${z}`);
    for (const field of Object.keys(FEED_TAGS)) if (f?.[field]) feeds[field].push(`${x}.${z}_${f[field][0]}.${f[field][1]}`);
  }
  const parts = [...groups].map(([type, cells]) => `${type}:${cells.join('-')}`);
  const assigned = Object.entries(FEED_TAGS).filter(([field]) => feeds[field].length).map(([field, tag]) => `${tag}:${feeds[field].join('-')}`);
  return `${LINK_KEY}=${[assigned.length ? 2 : 1, p.u, ...parts, ...assigned].join(',')}`;
}

// hash：location.hash（可带 #）。返回 null 表示 hash 里没有布局；否则返回 {u, list, warnings}
export function decodeLayout(hash, CAT, GRID){
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get(LINK_KEY);
  if (raw === null) return null;
  const warnings = [];
  const [version, utility, ...groups] = raw.split(',');
  const v = Number(version);
  if (v !== 1 && v !== 2) return {u: 2, list: [], warnings: [tr('linkVersion', {v: version})]};
  let u = Number(utility);
  if (!(u > 0 && Number.isFinite(u))){
    warnings.push(tr('linkUtility'));
    u = 2;
  }
  const list = [], seen = new Set(), assigned = [];
  for (const group of groups){
    const [type, cells = ''] = group.split(':');
    if (v === 2 && type.startsWith('@')){ assigned.push([type, cells]); continue; }
    if (!CAT[type]){ warnings.push(tr('linkType', {type})); continue; }
    for (const cell of cells.split('-').filter(Boolean)){
      const m = cell.match(/^(\d+)\.(\d+)$/);
      if (!m){ warnings.push(tr('linkCell', {cell: `${type}:${cell}`})); continue; }
      const x = +m[1], z = +m[2];
      if (x >= GRID.GW || z >= GRID.GD){ warnings.push(tr('linkOutside', {name: catName(CAT[type]), loc: loc(x, z)})); continue; }
      if (seen.has(keyOf(x, z))){ warnings.push(tr('linkOverlap', {name: catName(CAT[type]), loc: loc(x, z)})); continue; }
      seen.add(keyOf(x, z));
      list.push([type, x, z]);
    }
  }
  // 手动指定：两端都要是链接里载入了的设备，供给设备类型对，设备也需要这种供给
  const byKey = new Map(list.map(e => [keyOf(e[1], e[2]), e]));
  for (const [tag, pairs] of assigned){
    const field = Object.keys(FEED_TAGS).find(f => FEED_TAGS[f] === tag);
    if (!field){ warnings.push(tr('linkType', {type: tag})); continue; }
    for (const pair of pairs.split('-').filter(Boolean)){
      const m = pair.match(/^(\d+)\.(\d+)_(\d+)\.(\d+)$/);
      if (!m){ warnings.push(tr('linkCell', {cell: `${tag}:${pair}`})); continue; }
      const dev = byKey.get(keyOf(+m[1], +m[2])), src = byKey.get(keyOf(+m[3], +m[4]));
      if (!dev || !src || src[0] !== FEEDS[field].type || !FEEDS[field].needs(CAT[dev[0]])){ warnings.push(tr('linkFeed', {loc: loc(+m[1], +m[2])})); continue; }
      const it = {feeds: dev[3]};
      setFeed(it, field, {x: src[1], z: src[2]});
      dev[3] = it.feeds;
    }
  }
  return {u, list, warnings};
}
