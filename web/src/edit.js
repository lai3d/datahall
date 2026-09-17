// 编辑相关的纯函数：整排放置的格子、布局比较、撤销历史。不依赖 DOM 和 three
import {keyOf} from './grid.js';

const range = (a, b) => Array.from({length: Math.abs(b - a) + 1}, (_, i) => a + i * Math.sign(b - a || 1));

// 从 a 到 b 的一条直线：沿格子数差得多的方向（同一排或同一列），相等时沿排方向（x）
export function lineCells(a, b){
  if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) return range(a.x, b.x).map(x => ({x, z: a.z}));
  return range(a.z, b.z).map(z => ({x: a.x, z}));
}

// occupied：有 has(key) 的集合（state.items 或 Set）
export const freeCells = (cells, occupied) => cells.filter(c => !occupied.has(keyOf(c.x, c.z)));

// 布局 {u, list} 是否相同，与设备的先后顺序无关
const canonical = p => JSON.stringify([p.u, p.list.map(i => i.join(':')).sort()]);
export const sameLayout = (a, b) => canonical(a) === canonical(b);

// 撤销历史：保存编辑前的布局快照。record 清空重做栈；超过 limit 丢弃最早的
export function createHistory(limit = 100){
  let past = [], future = [];
  return {
    record(before){ past.push(before); if (past.length > limit) past.shift(); future = []; },
    undo(current){ if (!past.length) return null; future.push(current); return past.pop(); },
    redo(current){ if (!future.length) return null; past.push(current); return future.pop(); },
    get canUndo(){ return past.length > 0; },
    get canRedo(){ return future.length > 0; },
  };
}
