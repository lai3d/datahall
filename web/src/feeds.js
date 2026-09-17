// 手动指定供给设备的维护，纯函数（直接改传入的设备对象，不依赖 DOM）。
// items：Map(key → {type, x, z, feeds?})，即 state.items
import {FEEDS, keyOf} from './grid.js';

// 设置或清除一台设备的手动指定；target 为 null 表示恢复就近。feeds 的键顺序固定，空了就删掉
export function setFeed(it, field, target){
  const next = {...it.feeds, [field]: target ? [target.x, target.z] : undefined};
  const feeds = {};
  for (const f of Object.keys(FEEDS)) if (next[f]) feeds[f] = next[f];
  if (Object.keys(feeds).length) it.feeds = feeds; else delete it.feeds;
}

// 手动指定是否仍然有效：那一格是对应类型的供给设备，且设备本身需要这种供给
export function validFeed(items, it, field, CAT){
  const want = it.feeds?.[field];
  const target = want && items.get(keyOf(want[0], want[1]));
  return !!(target && target.type === FEEDS[field].type && FEEDS[field].needs(CAT[it.type]));
}

// 删掉失效的手动指定（供给设备被删、换成别的类型）。返回是否有改动
export function pruneFeeds(items, CAT){
  let changed = false;
  for (const it of items.values()){
    for (const field of Object.keys(it.feeds || {})){
      if (!validFeed(items, it, field, CAT)){ setFeed(it, field, null); changed = true; }
    }
  }
  return changed;
}

// 供给设备从 from 挪到 to：指向它的手动指定跟着改
export function retargetFeeds(items, from, to){
  for (const it of items.values()){
    for (const [field, pos] of Object.entries(it.feeds || {})){
      if (pos[0] === from.x && pos[1] === from.z) it.feeds[field] = [to.x, to.z];
    }
  }
}
