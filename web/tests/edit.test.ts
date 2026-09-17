import {describe, expect, it} from 'vitest';
import {lineCells, freeCells, sameLayout, createHistory} from '../src/edit.ts';
import {keyOf} from '../src/grid.ts';
import type {Layout} from '../src/types.ts';

describe('lineCells', () => {
  it('same cell', () => expect(lineCells({x: 2, z: 3}, {x: 2, z: 3})).toEqual([{x: 2, z: 3}]));
  it('along the row, ordered from start to end even when the start is on the right', () => {
    expect(lineCells({x: 5, z: 3}, {x: 2, z: 4})).toEqual([{x: 5, z: 3}, {x: 4, z: 3}, {x: 3, z: 3}, {x: 2, z: 3}]);
  });
  it('along the column when the column difference is larger', () => {
    expect(lineCells({x: 1, z: 0}, {x: 2, z: 3})).toEqual([{x: 1, z: 0}, {x: 1, z: 1}, {x: 1, z: 2}, {x: 1, z: 3}]);
  });
  it('along the row when the differences are equal', () => expect(lineCells({x: 0, z: 0}, {x: 2, z: 2}).map(c => c.z)).toEqual([0, 0, 0]));
});

it('freeCells skips occupied cells', () => {
  const occupied = new Set([keyOf(1, 0)]);
  expect(freeCells(lineCells({x: 0, z: 0}, {x: 2, z: 0}), occupied)).toEqual([{x: 0, z: 0}, {x: 2, z: 0}]);
});

it('sameLayout ignores order, compares utility power and equipment', () => {
  const a: Layout = {u: 2, list: [['gb200', 0, 0], ['cdu', 1, 0]]};
  expect(sameLayout(a, {u: 2, list: [['cdu', 1, 0], ['gb200', 0, 0]]})).toBe(true);
  expect(sameLayout(a, {u: 5, list: a.list})).toBe(false);
  expect(sameLayout(a, {u: 2, list: [['gb200', 0, 0], ['cdu', 2, 0]]})).toBe(false);
});

describe('createHistory', () => {
  it('undo, redo, and a new edit clears redo', () => {
    const h = createHistory<string>();
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
  it('drops the oldest entries past the limit', () => {
    const h = createHistory<string>(2);
    ['A', 'B', 'C'].forEach(s => h.record(s));
    expect(h.undo('D')).toBe('C');
    expect(h.undo('C')).toBe('B');
    expect(h.undo('B')).toBe(null);
  });
});
