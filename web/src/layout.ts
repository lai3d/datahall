import {keyOf} from './grid.ts';
import {MAX_PHASE} from './growth.ts';
import type {Catalog, Cell, Entry, EntryProps, FeedField, Feeds, Grid, Layout} from './types.ts';

const row = (type: string, xs: number[], z: number): Entry[] => xs.map(x => [type, x, z]);

// Layout format: {u: utility MW, list: [[type, x, z], ...]}
export const PRESETS: Record<'empty' | 'gb200' | 'gb200n1' | 'rubin', Layout> = {
  empty: {u: 2, list: []},
  gb200: {u: 2, list: [
    ...row('gb200', [4,5,6,7,8,9,10,11], 3),
    ['cdu',4,5],['cdu',5,5],['ib',6,5],['ib',7,5],['rpp',8,5],['rpp',9,5],['crah',10,5],['crah',11,5]]},
  // Same 8 GB200 racks with 3 of each facility: if any single CDU, RPP, IB or in-row cooler fails, the hall still passes the capacity check (redundancy.ts)
  gb200n1: {u: 2, list: [
    ...row('gb200', [4,5,6,7,8,9,10,11], 3),
    ...[0, 1, 2].flatMap(k => ['cdu', 'rpp', 'ib', 'crah'].map((t, j): Entry => [t, 2 + k * 4 + j, 5]))]},
  // Facilities placed in repeating groups of "CDU, RPP, IB, in-row cooler"; the nearest-assigned load of each CDU and RPP stays within capacity (supply.ts checks each unit)
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
// The saved layout, cleaned up by parseSavedLayout; null when nothing usable is saved
export function restoreLayout(CAT: Catalog, grid: Grid): Layout | null{
  try { const raw = localStorage.getItem(KEY); return raw ? parseSavedLayout(raw, CAT, grid) : null; } catch (e) { return null; }
}

// localStorage can hold anything: older formats, hand edits, a half-written value. Keep every entry that is
// valid, drop the rest, and never throw, so a bad saved layout cannot stop the page from loading.
// Returns null when the text is not a layout at all.
export function parseSavedLayout(raw: string, CAT: Catalog, grid: Grid): Layout | null{
  let p: unknown;
  try { p = JSON.parse(raw); } catch (e) { return null; }
  if (!p || typeof p !== 'object' || !Array.isArray((p as Layout).list)) return null;
  const u = (p as Layout).u;
  const inGrid = (x: unknown, z: unknown): x is number => Number.isInteger(x) && Number.isInteger(z) &&
    (x as number) >= 0 && (x as number) < grid.GW && (z as number) >= 0 && (z as number) < grid.GD;
  const cell = (c: unknown): c is Cell => Array.isArray(c) && c.length === 2 && inGrid(c[0], c[1]);
  const seen = new Set<string>(), list: Entry[] = [];
  for (const e of (p as Layout).list as unknown[]){
    if (!Array.isArray(e)) continue;
    const [type, x, z, props] = e;
    if (typeof type !== 'string' || !Object.hasOwn(CAT, type) || !inGrid(x, z) || seen.has(keyOf(x, z as number))) continue;
    seen.add(keyOf(x, z as number));
    // The 4th item is {feeds?, phase?}, or the short-lived bare feeds form (see entryProps in edit.ts)
    const src = props && typeof props === 'object' ? ('coolantSource' in props || 'powerFeed' in props ? {feeds: props} : props) : {};
    const clean: EntryProps = {};
    const feeds: Feeds = {};
    for (const f of ['coolantSource', 'powerFeed'] as FeedField[]) if (cell(src.feeds?.[f])) feeds[f] = [src.feeds[f][0], src.feeds[f][1]];
    if (Object.keys(feeds).length) clean.feeds = feeds;
    if (Number.isInteger(src.phase) && src.phase > 1 && src.phase <= MAX_PHASE) clean.phase = src.phase;
    list.push(Object.keys(clean).length ? [type, x, z as number, clean] : [type, x, z as number]);
  }
  return {u: typeof u === 'number' && u > 0 && Number.isFinite(u) ? u : 2, list};
}
