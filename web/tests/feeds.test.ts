import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.ts';
import {keyOf, supplyLinks} from '../src/grid.ts';
import {setFeed, validFeed, pruneFeeds, retargetFeeds} from '../src/feeds.ts';
import type {Entry, Feeds, Item} from '../src/types.ts';

const at = (type: string, x: number, z: number, feeds?: Feeds): Item => feeds ? {type, x, z, feeds} : {type, x, z};
const mapOf = (list: Item[]) => new Map(list.map(i => [keyOf(i.x, i.z), i]));
const name = (i: Item | null | undefined) => i && `${i.type}@${i.x},${i.z}`;

describe('supplyLinks manual assignment', () => {
  const cduNear = at('cdu', 0, 5), cduFar = at('cdu', 10, 5), rpp = at('rpp', 1, 5);

  it('uses the assignment when valid, otherwise the nearest', () => {
    const rack = at('vr200', 0, 3, {coolantSource: [10, 5]});
    const links = supplyLinks([rack, cduNear, cduFar, rpp], CAT);
    expect(name(links.get(rack)!.coolantSource)).toBe('cdu@10,5');
    expect(name(links.get(rack)!.powerFeed)).toBe('rpp@1,5');
  });

  it('falls back to the nearest when the assigned cell is not a CDU, is gone, or the device does not need that supply', () => {
    const wrongType = at('vr200', 0, 3, {coolantSource: [1, 5]});
    const gone = at('vr200', 1, 3, {coolantSource: [7, 7]});
    const aircooled = at('ib', 2, 3, {coolantSource: [10, 5]});
    const links = supplyLinks([wrongType, gone, aircooled, cduNear, cduFar, rpp], CAT);
    expect(name(links.get(wrongType)!.coolantSource)).toBe('cdu@0,5');
    expect(name(links.get(gone)!.coolantSource)).toBe('cdu@0,5');
    expect(links.get(aircooled)!.coolantSource).toBe(null);
  });

  it('falls back to the nearest when the assigned device is removed from the list (failure drill)', () => {
    const rack = at('vr200', 0, 3, {coolantSource: [10, 5]});
    expect(name(supplyLinks([rack, cduNear, rpp], CAT).get(rack)!.coolantSource)).toBe('cdu@0,5');
  });
});

describe('feeds maintenance', () => {
  it('setFeed: fixed key order, feeds removed once empty', () => {
    const rack = at('vr200', 0, 3);
    setFeed(rack, 'powerFeed', {x: 1, z: 5});
    setFeed(rack, 'coolantSource', {x: 2, z: 5});
    expect(Object.keys(rack.feeds!)).toEqual(['coolantSource', 'powerFeed']);
    expect(JSON.stringify(rack.feeds)).toBe('{"coolantSource":[2,5],"powerFeed":[1,5]}');
    setFeed(rack, 'coolantSource', null);
    setFeed(rack, 'powerFeed', null);
    expect('feeds' in rack).toBe(false);
  });

  it('pruneFeeds removes stale assignments, retargetFeeds follows the moved supply device', () => {
    const rack = at('vr200', 0, 3, {coolantSource: [10, 5], powerFeed: [9, 5]});
    const items = mapOf([rack, at('cdu', 10, 5), at('crah', 9, 5)]);
    expect(validFeed(items, rack, 'coolantSource', CAT)).toBe(true);
    expect(pruneFeeds(items, CAT)).toBe(true);
    expect(rack.feeds).toEqual({coolantSource: [10, 5]});
    expect(pruneFeeds(items, CAT)).toBe(false);
    retargetFeeds(items, {x: 10, z: 5}, {x: 11, z: 6});
    expect(rack.feeds).toEqual({coolantSource: [11, 6]});
  });
});

describe('manual assignments across all formats', async () => {
  const {encodeLayout, decodeLayout} = await import('../src/share-link.ts');
  const {buildUsda} = await import('../src/usd-export.ts');
  const {importUsda} = await import('../src/usd-import.ts');
  const {buildLayout} = await import('../src/layout-export.ts');
  const {sameLayout, toEntry, entryProps} = await import('../src/edit.ts');
  const {GRID} = await import('../src/grid.ts');
  const {propsItems} = await import('../scripts/layout-props-usda.ts');
  // Manual assignments only; phases are tested in growth.test.ts
  const items = propsItems().map(({phase, ...it}) => it);
  const snap = {u: 2, list: items.map(toEntry)};
  const feedsOf = (list: Entry[]) => list.filter(e => entryProps(e).feeds).map(e => [e[1], e[2], entryProps(e).feeds] as const).sort((a, b) => a[0] - b[0]);
  const base = (e: Entry): Entry => [e[0], e[1], e[2]];

  it('share link: version 2 with manual assignments, decoded back; still version 1 without them', () => {
    const hash = encodeLayout(snap);
    expect(hash).toMatch(/^layout=2,2,.*,@c:4\.3_5\.5,@p:11\.3_8\.5$/);
    expect(encodeURI(hash)).toBe(hash);
    const back = decodeLayout('#' + hash, CAT, GRID)!;
    expect(back.warnings).toEqual([]);
    expect(feedsOf(back.list)).toEqual([[4, 3, {coolantSource: [5, 5]}], [11, 3, {powerFeed: [8, 5]}]]);
    expect(sameLayout(back, snap)).toBe(true);
    expect(encodeLayout({u: 2, list: snap.list.map(base)})).toMatch(/^layout=1,/);
  });

  it('share link: invalid assignments are skipped with a warning', () => {
    const r = decodeLayout('#layout=2,2,vr200:0.3,cdu:0.5,rpp:1.5,@c:0.3_1.5-9.9_0.5-0.3_x,@p:0.3_1.5,@z:0.3_0.5', CAT, GRID)!;
    expect(feedsOf(r.list)).toEqual([[0, 3, {powerFeed: [1, 5]}]]);
    expect(r.warnings.length).toBe(4);
  });

  it('USD: exported relationships target the assigned devices and import restores the same assignments', () => {
    const usda = buildUsda(items, CAT, 2, GRID, {date: '2026-09-17'});
    expect(usda).toMatch(/"R04_C05"[\s\S]*?rel dchall:coolantSource = <\/DataHall\/Equipment\/R06_C06>/);
    const back = importUsda(usda, CAT, GRID);
    expect(back.warnings).toEqual([]);
    expect(feedsOf(back.list)).toEqual([[4, 3, {coolantSource: [5, 5]}], [11, 3, {powerFeed: [8, 5]}]]);
  });

  it('layout.json: equipment coolantSource / powerFeed are the manually assigned devices', () => {
    const eq = buildLayout(items, CAT, 2, GRID, {date: '2026-09-17'}).equipment;
    expect(eq.find(e => e.name === 'R04_C05')!.coolantSource).toBe('R06_C06');
    expect(eq.find(e => e.name === 'R04_C12')!.powerFeed).toBe('R06_C09');
  });

  it('sameLayout detects manual assignment changes; the old entry form (4th item is feeds directly) counts as equal', () => {
    expect(sameLayout(snap, {u: 2, list: snap.list.map(base)})).toBe(false);
    expect(sameLayout(snap, {u: 2, list: snap.list.map((e): Entry => e[3] ? [e[0], e[1], e[2], entryProps(e).feeds] : e)})).toBe(true);
  });
});
