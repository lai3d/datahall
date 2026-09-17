// Regression tests for the three bugs from the 2026-09-17 review
import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.ts';
import {supplyLinks} from '../src/grid.ts';
import {supplyLoads} from '../src/supply.ts';
import type {Item} from '../src/types.ts';

const at = (type: string, x: number, z: number): Item => ({type, x, z});
const target = (list: Item[], rack: Item) => { const s = supplyLinks(list, CAT).get(rack)!.coolantSource; return s && `${s.x},${s.z}`; };

describe('nearest-supply ties do not depend on placement order', () => {
  it('a rack exactly between two CDUs picks the same one in either order', () => {
    const rack = at('vr200', 5, 3), left = at('cdu', 4, 3), right = at('cdu', 6, 3);
    expect(target([rack, left, right], rack)).toBe(target([rack, right, left], rack));
  });

  it('per-device loads are the same for any order of the same devices (dragging reorders them)', () => {
    // Racks in column 5 tie between the CDUs in columns 3 and 7
    const list = [at('cdu', 7, 5), ...[3, 4, 5, 6, 7].map(z => at('vr200', 5, z)), at('cdu', 3, 5), at('rpp', 5, 8)];
    const loads = (l: Item[]) => [...supplyLoads(l, CAT).supplies].map(([it, s]) => `${it.type}@${it.x},${it.z}:${Math.round(s.loadKw)}`).sort();
    const expected = loads(list);
    for (const order of [[...list].reverse(), [list[6], ...list.slice(0, 6), list[7]], [...list.slice(1), list[0]]]) expect(loads(order)).toEqual(expected);
  });
});

describe('a corrupt saved layout cannot stop the page from loading', async () => {
  const {parseSavedLayout, PRESETS} = await import('../src/layout.ts');
  const {GRID} = await import('../src/grid.ts');
  const {toItems, toEntry} = await import('../src/edit.ts');

  it('returns null for text that is not a layout', () => {
    for (const raw of ['', 'not json', 'null', '42', '{"u": 2}', '{"list": "nope"}']) expect(parseSavedLayout(raw, CAT, GRID), raw).toBe(null);
  });

  it('keeps valid entries and drops broken ones without throwing', () => {
    const raw = JSON.stringify({u: -1, list: [
      ['gb200', 4, 3], null, 42, ['nope', 1, 1], ['cdu', 99, 0], ['cdu', 1.5, 0], ['rpp', 4, 3],
      ['cdu', 4, 5, {feeds: {coolantSource: 'x', powerFeed: [8, 5]}, phase: 'two'}],
      ['rpp', 8, 5, {phase: 99}], ['ib', 6, 5, {coolantSource: [4, 5]}], ['crah', 10, 5, {phase: 3}],
    ]});
    const p = parseSavedLayout(raw, CAT, GRID)!;
    expect(p.u).toBe(2);
    expect(p.list).toEqual([
      ['gb200', 4, 3], ['cdu', 4, 5, {feeds: {powerFeed: [8, 5]}}], ['rpp', 8, 5], ['ib', 6, 5, {feeds: {coolantSource: [4, 5]}}], ['crah', 10, 5, {phase: 3}],
    ]);
  });

  it('round-trips a valid layout unchanged', () => {
    const p = {u: 5, list: toItems(PRESETS.rubin.list).map(toEntry)};
    expect(parseSavedLayout(JSON.stringify(p), CAT, GRID)).toEqual(p);
  });
});

describe('the phase cap matches between the UI, share links and imports', async () => {
  const {MAX_PHASE} = await import('../src/growth.ts');
  const {encodeLayout, decodeLayout} = await import('../src/share-link.ts');
  const {GRID} = await import('../src/grid.ts');

  it('a layout using the highest phase survives a share-link round trip without warnings', () => {
    const hash = encodeLayout({u: 2, list: [['gb200', 0, 0, {phase: MAX_PHASE}]]});
    const back = decodeLayout('#' + hash, CAT, GRID)!;
    expect(back.warnings).toEqual([]);
    expect(back.list).toEqual([['gb200', 0, 0, {phase: MAX_PHASE}]]);
  });
});
