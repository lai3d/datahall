import {describe, expect, it} from 'vitest';
import {lineCells, freeCells, sameLayout, createHistory} from '../src/edit.js';
import {keyOf} from '../src/grid.js';

describe('lineCells', () => {
  it('同一格', () => expect(lineCells({x: 2, z: 3}, {x: 2, z: 3})).toEqual([{x: 2, z: 3}]));
  it('沿排方向，起点在右边也按起点到终点排列', () => {
    expect(lineCells({x: 5, z: 3}, {x: 2, z: 4})).toEqual([{x: 5, z: 3}, {x: 4, z: 3}, {x: 3, z: 3}, {x: 2, z: 3}]);
  });
  it('列方向差得多时沿列', () => {
    expect(lineCells({x: 1, z: 0}, {x: 2, z: 3})).toEqual([{x: 1, z: 0}, {x: 1, z: 1}, {x: 1, z: 2}, {x: 1, z: 3}]);
  });
  it('差相等时沿排', () => expect(lineCells({x: 0, z: 0}, {x: 2, z: 2}).map(c => c.z)).toEqual([0, 0, 0]));
});

it('freeCells 跳过已占用的格子', () => {
  const occupied = new Set([keyOf(1, 0)]);
  expect(freeCells(lineCells({x: 0, z: 0}, {x: 2, z: 0}), occupied)).toEqual([{x: 0, z: 0}, {x: 2, z: 0}]);
});

it('sameLayout 不看顺序，看市电和设备', () => {
  const a = {u: 2, list: [['gb200', 0, 0], ['cdu', 1, 0]]};
  expect(sameLayout(a, {u: 2, list: [['cdu', 1, 0], ['gb200', 0, 0]]})).toBe(true);
  expect(sameLayout(a, {u: 5, list: a.list})).toBe(false);
  expect(sameLayout(a, {u: 2, list: [['gb200', 0, 0], ['cdu', 2, 0]]})).toBe(false);
});

describe('createHistory', () => {
  it('撤销、重做，新的编辑清空重做', () => {
    const h = createHistory();
    expect(h.canUndo).toBe(false);
    h.record('A');                        // A → B
    h.record('B');                        // B → C
    expect(h.undo('C')).toBe('B');
    expect(h.undo('B')).toBe('A');
    expect(h.undo('A')).toBe(null);
    expect(h.canRedo).toBe(true);
    expect(h.redo('A')).toBe('B');
    h.record('B');                        // B → D
    expect(h.canRedo).toBe(false);
    expect(h.undo('D')).toBe('B');
    expect(h.undo('B')).toBe('A');
  });
  it('超过上限丢弃最早的', () => {
    const h = createHistory(2);
    ['A', 'B', 'C'].forEach(s => h.record(s));
    expect(h.undo('D')).toBe('C');
    expect(h.undo('C')).toBe('B');
    expect(h.undo('B')).toBe(null);
  });
});
