// Pure editing helpers: cells for row placement, layout comparison, undo history. No DOM or three dependency
import {keyOf} from './grid.ts';
import type {Entry, EntryProps, Feeds, Item, Layout, Pos} from './types.ts';

const range = (a: number, b: number): number[] => Array.from({length: Math.abs(b - a) + 1}, (_, i) => a + i * Math.sign(b - a || 1));

// A straight line from a to b: along the axis with the larger cell difference (same row or same column); on a tie, along the row (x)
export function lineCells(a: Pos, b: Pos): Pos[]{
  if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) return range(a.x, b.x).map(x => ({x, z: a.z}));
  return range(a.z, b.z).map(z => ({x: a.x, z}));
}

// Layout snapshot entry: [type, x, z] or [type, x, z, props], props = {feeds?, phase?}
//   feeds: manually assigned supply equipment (supplyLinks in grid.ts); phase: deployment phase, written only when greater than 1 (growth.ts)
// On 2026-09-17 a format with feeds ({coolantSource, powerFeed}) directly as the 4th element was briefly released; localStorage may still hold it, so reading stays compatible
export function entryProps(entry: Entry): EntryProps{
  const p = entry[3];
  if (!p) return {};
  return 'coolantSource' in p || 'powerFeed' in p ? {feeds: p as Feeds} : p as EntryProps;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
// Snapshot entry → device object used for computation {type, x, z, feeds?, phase?} (deep copy)
export function toItem(entry: Entry): Item{
  const [type, x, z] = entry, {feeds, phase} = entryProps(entry);
  const it: Item = {type, x, z};
  if (feeds) it.feeds = clone(feeds);
  if (phase && phase > 1) it.phase = phase;
  return it;
}
export const toItems = (list: Entry[]): Item[] => list.map(toItem);
// Device object → snapshot entry (deep copy)
export function toEntry(it: Item): Entry{
  const props: EntryProps = {};
  if (it.feeds) props.feeds = clone(it.feeds);
  if (it.phase && it.phase > 1) props.phase = it.phase;
  return Object.keys(props).length ? [it.type, it.x, it.z, props] : [it.type, it.x, it.z];
}

// occupied: a collection with has(key) (state.items or a Set)
export const freeCells = (cells: Pos[], occupied: {has(key: string): boolean}): Pos[] => cells.filter(c => !occupied.has(keyOf(c.x, c.z)));

// Whether layouts {u, list} are equal, regardless of device order
const canonical = (p: Layout): string => JSON.stringify([p.u, p.list.map(e => JSON.stringify(toEntry(toItem(e)))).sort()]);
export const sameLayout = (a: Layout, b: Layout): boolean => canonical(a) === canonical(b);

// Undo history: stores layout snapshots taken before each edit. record clears the redo stack; beyond limit the oldest is dropped
export interface History<T>{
  record(before: T): void;
  undo(current: T): T | null;
  redo(current: T): T | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
export function createHistory<T = Layout>(limit = 100): History<T>{
  let past: T[] = [], future: T[] = [];
  return {
    record(before){ past.push(before); if (past.length > limit) past.shift(); future = []; },
    undo(current){ if (!past.length) return null; future.push(current); return past.pop()!; },
    redo(current){ if (!future.length) return null; past.push(current); return future.pop()!; },
    get canUndo(){ return past.length > 0; },
    get canRedo(){ return future.length > 0; },
  };
}
