// 手动指定供给设备的维护，纯函数（直接改传入的设备对象，不依赖 DOM）。
// items：Map(key → {type, x, z, feeds?})，即 state.items
import {FEEDS, FEED_FIELDS, keyOf} from './grid.ts';
import type {Catalog, FeedField, Feeds, Item, Pos} from './types.ts';

// 设置或清除一台设备的手动指定；target 为 null 表示恢复就近。feeds 的键顺序固定，空了就删掉
export function setFeed(it: {feeds?: Feeds}, field: FeedField, target: Pos | null): void{
  const next: Feeds = {...it.feeds, [field]: target ? [target.x, target.z] : undefined};
  const feeds: Feeds = {};
  for (const f of FEED_FIELDS) if (next[f]) feeds[f] = next[f];
  if (Object.keys(feeds).length) it.feeds = feeds; else delete it.feeds;
}

// 手动指定是否仍然有效：那一格是对应类型的供给设备，且设备本身需要这种供给
export function validFeed(items: Map<string, Item>, it: Item, field: FeedField, CAT: Catalog): boolean{
  const want = it.feeds?.[field];
  const target = want && items.get(keyOf(want[0], want[1]));
  return !!(target && target.type === FEEDS[field].type && FEEDS[field].needs(CAT[it.type]));
}

// 删掉失效的手动指定（供给设备被删、换成别的类型）。返回是否有改动
export function pruneFeeds(items: Map<string, Item>, CAT: Catalog): boolean{
  let changed = false;
  for (const it of items.values()){
    for (const field of Object.keys(it.feeds || {}) as FeedField[]){
      if (!validFeed(items, it, field, CAT)){ setFeed(it, field, null); changed = true; }
    }
  }
  return changed;
}

// 供给设备从 from 挪到 to：指向它的手动指定跟着改
export function retargetFeeds(items: Map<string, Item>, from: Pos, to: Pos): void{
  for (const it of items.values()){
    const feeds = it.feeds;
    if (!feeds) continue;
    for (const field of Object.keys(feeds) as FeedField[]){
      const pos = feeds[field];
      if (pos && pos[0] === from.x && pos[1] === from.z) feeds[field] = [to.x, to.z];
    }
  }
}
