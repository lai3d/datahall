// 编辑相关的纯函数：整排放置的格子、布局比较、撤销历史。不依赖 DOM 和 three
import {keyOf} from './grid.ts';
import type {Entry, EntryProps, Feeds, Item, Layout, Pos} from './types.ts';

const range = (a: number, b: number): number[] => Array.from({length: Math.abs(b - a) + 1}, (_, i) => a + i * Math.sign(b - a || 1));

// 从 a 到 b 的一条直线：沿格子数差得多的方向（同一排或同一列），相等时沿排方向（x）
export function lineCells(a: Pos, b: Pos): Pos[]{
  if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) return range(a.x, b.x).map(x => ({x, z: a.z}));
  return range(a.z, b.z).map(z => ({x: a.x, z}));
}

// 布局快照的条目：[type, x, z] 或 [type, x, z, props]，props = {feeds?, phase?}
//   feeds：手动指定的供给设备（grid.ts 的 supplyLinks）；phase：部署阶段，大于 1 才写（growth.ts）
// 2026-09-17 短暂发布过第 4 项直接是 feeds（{coolantSource, powerFeed}）的写法，localStorage 里可能还有，读的时候兼容
export function entryProps(entry: Entry): EntryProps{
  const p = entry[3];
  if (!p) return {};
  return 'coolantSource' in p || 'powerFeed' in p ? {feeds: p as Feeds} : p as EntryProps;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
// 快照条目 → 计算用的设备对象 {type, x, z, feeds?, phase?}（深拷贝）
export function toItem(entry: Entry): Item{
  const [type, x, z] = entry, {feeds, phase} = entryProps(entry);
  const it: Item = {type, x, z};
  if (feeds) it.feeds = clone(feeds);
  if (phase && phase > 1) it.phase = phase;
  return it;
}
export const toItems = (list: Entry[]): Item[] => list.map(toItem);
// 设备对象 → 快照条目（深拷贝）
export function toEntry(it: Item): Entry{
  const props: EntryProps = {};
  if (it.feeds) props.feeds = clone(it.feeds);
  if (it.phase && it.phase > 1) props.phase = it.phase;
  return Object.keys(props).length ? [it.type, it.x, it.z, props] : [it.type, it.x, it.z];
}

// occupied：有 has(key) 的集合（state.items 或 Set）
export const freeCells = (cells: Pos[], occupied: {has(key: string): boolean}): Pos[] => cells.filter(c => !occupied.has(keyOf(c.x, c.z)));

// 布局 {u, list} 是否相同，与设备的先后顺序无关
const canonical = (p: Layout): string => JSON.stringify([p.u, p.list.map(e => JSON.stringify(toEntry(toItem(e)))).sort()]);
export const sameLayout = (a: Layout, b: Layout): boolean => canonical(a) === canonical(b);

// 撤销历史：保存编辑前的布局快照。record 清空重做栈；超过 limit 丢弃最早的
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
