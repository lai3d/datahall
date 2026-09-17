// Maintenance of manually assigned supply equipment; pure functions (they mutate the passed device objects directly, no DOM dependency).
// items: Map(key → {type, x, z, feeds?}), i.e. state.items
import {FEEDS, FEED_FIELDS, keyOf} from './grid.ts';
import type {Catalog, FeedField, Feeds, Item, Pos} from './types.ts';

// Set or clear a device's manual assignment; target null reverts to nearest. feeds key order is fixed, and feeds is deleted when empty
export function setFeed(it: {feeds?: Feeds}, field: FeedField, target: Pos | null): void{
  const next: Feeds = {...it.feeds, [field]: target ? [target.x, target.z] : undefined};
  const feeds: Feeds = {};
  for (const f of FEED_FIELDS) if (next[f]) feeds[f] = next[f];
  if (Object.keys(feeds).length) it.feeds = feeds; else delete it.feeds;
}

// Whether a manual assignment is still valid: that cell holds supply equipment of the matching type, and the device actually needs that supply
export function validFeed(items: Map<string, Item>, it: Item, field: FeedField, CAT: Catalog): boolean{
  const want = it.feeds?.[field];
  const target = want && items.get(keyOf(want[0], want[1]));
  return !!(target && target.type === FEEDS[field].type && FEEDS[field].needs(CAT[it.type]));
}

// Remove stale manual assignments (supply equipment deleted or replaced with another type). Returns whether anything changed
export function pruneFeeds(items: Map<string, Item>, CAT: Catalog): boolean{
  let changed = false;
  for (const it of items.values()){
    for (const field of Object.keys(it.feeds || {}) as FeedField[]){
      if (!validFeed(items, it, field, CAT)){ setFeed(it, field, null); changed = true; }
    }
  }
  return changed;
}

// Supply equipment moved from `from` to `to`: manual assignments pointing at it follow
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
