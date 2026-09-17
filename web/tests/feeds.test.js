import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.js';
import {keyOf, supplyLinks} from '../src/grid.js';
import {setFeed, validFeed, pruneFeeds, retargetFeeds} from '../src/feeds.js';

const at = (type, x, z, feeds) => feeds ? {type, x, z, feeds} : {type, x, z};
const mapOf = list => new Map(list.map(i => [keyOf(i.x, i.z), i]));
const name = i => i && `${i.type}@${i.x},${i.z}`;

describe('supplyLinks 手动指定', () => {
  const cduNear = at('cdu', 0, 5), cduFar = at('cdu', 10, 5), rpp = at('rpp', 1, 5);

  it('指定有效时接指定的，否则就近', () => {
    const rack = at('vr200', 0, 3, {coolantSource: [10, 5]});
    const links = supplyLinks([rack, cduNear, cduFar, rpp], CAT);
    expect(name(links.get(rack).coolantSource)).toBe('cdu@10,5');
    expect(name(links.get(rack).powerFeed)).toBe('rpp@1,5');
  });

  it('指定的格子不是 CDU、已经不在、或设备不需要这种供给时，退回就近', () => {
    const wrongType = at('vr200', 0, 3, {coolantSource: [1, 5]});
    const gone = at('vr200', 1, 3, {coolantSource: [7, 7]});
    const aircooled = at('ib', 2, 3, {coolantSource: [10, 5]});
    const links = supplyLinks([wrongType, gone, aircooled, cduNear, cduFar, rpp], CAT);
    expect(name(links.get(wrongType).coolantSource)).toBe('cdu@0,5');
    expect(name(links.get(gone).coolantSource)).toBe('cdu@0,5');
    expect(links.get(aircooled).coolantSource).toBe(null);
  });

  it('被指定的设备从列表里拿掉（故障演练）时退回就近', () => {
    const rack = at('vr200', 0, 3, {coolantSource: [10, 5]});
    expect(name(supplyLinks([rack, cduNear, rpp], CAT).get(rack).coolantSource)).toBe('cdu@0,5');
  });
});

describe('feeds 维护', () => {
  it('setFeed：键顺序固定，清空后删除 feeds', () => {
    const rack = at('vr200', 0, 3);
    setFeed(rack, 'powerFeed', {x: 1, z: 5});
    setFeed(rack, 'coolantSource', {x: 2, z: 5});
    expect(Object.keys(rack.feeds)).toEqual(['coolantSource', 'powerFeed']);
    expect(JSON.stringify(rack.feeds)).toBe('{"coolantSource":[2,5],"powerFeed":[1,5]}');
    setFeed(rack, 'coolantSource', null);
    setFeed(rack, 'powerFeed', null);
    expect('feeds' in rack).toBe(false);
  });

  it('pruneFeeds 删掉失效的指定，retargetFeeds 跟着供给设备挪', () => {
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

describe('手动指定贯穿各个格式', async () => {
  const {encodeLayout, decodeLayout} = await import('../src/share-link.js');
  const {buildUsda} = await import('../src/usd-export.js');
  const {importUsda} = await import('../src/usd-import.js');
  const {buildLayout} = await import('../src/layout-export.js');
  const {sameLayout, toEntry} = await import('../src/edit.js');
  const {GRID} = await import('../src/grid.js');
  const {propsItems} = await import('../scripts/layout-props-usda.js');
  // 只取手动指定，阶段在 growth.test.js 里测
  const items = propsItems().map(({phase, ...it}) => it);
  const snap = {u: 2, list: items.map(toEntry)};
  const feedsOf = list => list.filter(e => e[3]?.feeds).map(e => [e[1], e[2], e[3].feeds]).sort((a, b) => a[0] - b[0]);

  it('分享链接：有手动指定时用版本 2，解码还原；没有时仍是版本 1', () => {
    const hash = encodeLayout(snap);
    expect(hash).toMatch(/^layout=2,2,.*,@c:4\.3_5\.5,@p:11\.3_8\.5$/);
    expect(encodeURI(hash)).toBe(hash);
    const back = decodeLayout('#' + hash, CAT, GRID);
    expect(back.warnings).toEqual([]);
    expect(feedsOf(back.list)).toEqual([[4, 3, {coolantSource: [5, 5]}], [11, 3, {powerFeed: [8, 5]}]]);
    expect(sameLayout(back, snap)).toBe(true);
    expect(encodeLayout({u: 2, list: snap.list.map(e => e.slice(0, 3))})).toMatch(/^layout=1,/);
  });

  it('分享链接：无效的指定跳过并提示', () => {
    const r = decodeLayout('#layout=2,2,vr200:0.3,cdu:0.5,rpp:1.5,@c:0.3_1.5-9.9_0.5-0.3_x,@p:0.3_1.5,@z:0.3_0.5', CAT, GRID);
    expect(feedsOf(r.list)).toEqual([[0, 3, {powerFeed: [1, 5]}]]);
    expect(r.warnings.length).toBe(4);
  });

  it('USD：导出的关系指向手动指定的设备，导入后还原成同样的手动指定', () => {
    const usda = buildUsda(items, CAT, 2, GRID, {date: '2026-09-17'});
    expect(usda).toMatch(/"R04_C05"[\s\S]*?rel dchall:coolantSource = <\/DataHall\/Equipment\/R06_C06>/);
    const back = importUsda(usda, CAT, GRID);
    expect(back.warnings).toEqual([]);
    expect(feedsOf(back.list)).toEqual([[4, 3, {coolantSource: [5, 5]}], [11, 3, {powerFeed: [8, 5]}]]);
  });

  it('layout.json：equipment 的 coolantSource / powerFeed 是手动指定的设备', () => {
    const eq = buildLayout(items, CAT, 2, GRID, {date: '2026-09-17'}).equipment;
    expect(eq.find(e => e.name === 'R04_C05').coolantSource).toBe('R06_C06');
    expect(eq.find(e => e.name === 'R04_C12').powerFeed).toBe('R06_C09');
  });

  it('sameLayout 能看出手动指定的变化；旧的条目写法（第 4 项直接是 feeds）视为相同', () => {
    expect(sameLayout(snap, {u: 2, list: snap.list.map(e => e.slice(0, 3))})).toBe(false);
    expect(sameLayout(snap, {u: 2, list: snap.list.map(e => e[3] ? [...e.slice(0, 3), e[3].feeds] : e)})).toBe(true);
  });
});
