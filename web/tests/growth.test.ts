import {describe, expect, it} from 'vitest';
import {compute} from '../src/sim.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {phasesIn, growthPlan, headroom, utilization} from '../src/growth.ts';
import {PRESETS} from '../src/layout.ts';
import {toItems} from '../src/edit.ts';
import type {Item, Layout} from '../src/types.ts';

const at = (type: string, x: number, z: number, phase?: number): Item => phase ? {type, x, z, phase} : {type, x, z};

describe('growthPlan', () => {
  // 第 1 阶段：4 柜 GB200 和设施；第 2 阶段再加 4 柜，液冷不够
  const items = [
    ...[0, 1, 2, 3].map(x => at('gb200', x, 3)), at('cdu', 0, 5), at('rpp', 1, 5), at('ib', 2, 5), at('crah', 3, 5),
    ...[4, 5, 6, 7].map(x => at('gb200', x, 3, 2)),
  ];

  it('阶段升序，缺省为 1', () => {
    expect(phasesIn(items)).toEqual([1, 2]);
    expect(phasesIn([])).toEqual([]);
  });

  it('逐阶段累计，找出最紧的一项和不满足的原因', () => {
    const [p1, p2] = growthPlan(items, CAT, 2);
    expect([p1.phase, p1.count, p1.gpus, p1.reasons]).toEqual([1, 8, 288, []]);
    expect(p1.tightest).toEqual({kind: 'network', ratio: 1});   // 288 颗 GPU 正好占满一台 IB 的 288 个端口
    expect(p1.util.liquid).toBeCloseTo(425 / 800);
    expect([p2.phase, p2.count, p2.gpus]).toEqual([2, 12, 576]);
    expect(p2.reasons.map(r => r.kind)).toEqual(['dist', 'liquid', 'air', 'network']);
    expect(p2.tightest).toEqual({kind: 'network', ratio: 2});
  });

  it('没有阶段信息的预设只有一个阶段，结果和 compute 一致', () => {
    const p = PRESETS.rubin;
    const plan = growthPlan(toItems(p.list), CAT, p.u);
    expect(plan.length).toBe(1);
    expect(plan[0].itKw).toBe(compute(toItems(p.list), CAT, p.u).it);
    expect(plan[0].reasons).toEqual([]);
  });

  it('容量为 0 的项记为 Infinity', () => {
    const u = utilization(compute([at('vr200', 0, 0)], CAT, 2), 2);
    expect(u.dist).toBe(Infinity);
    expect(utilization(compute([], CAT, 2), 2).dist).toBe(0);
  });
});

describe('headroom', () => {
  it('算出的台数加上去仍满足总量，再多一台就不满足（每种 GPU 机柜、每个预设）', () => {
    const gpuTypes = CATALOG.filter(t => t.gpus).map(t => t.id);
    for (const p of [PRESETS.gb200, PRESETS.gb200n1, PRESETS.rubin]){
      const base = toItems(p.list);
      for (const type of gpuTypes){
        const {count, limit} = headroom(base, CAT, p.u, type);
        const add = (n: number) => [...base, ...Array.from({length: n}, (_, i) => at(type, i, 9))];
        const totalsOk = (list: Item[]) => !compute(list, CAT, p.u).issues.some(i => i.lvl === 'bad');
        expect(totalsOk(add(count)), `${type} +${count}`).toBe(true);
        expect(totalsOk(add(count + 1)), `${type} +${count + 1} (${limit})`).toBe(false);
      }
    }
  });

  it('已经超了的项返回 0 台', () => {
    expect(headroom([at('vr200', 0, 0)], CAT, 2, 'vr200')).toEqual({limit: 'dist', count: 0});
  });
});

describe('分享链接里的阶段', async () => {
  const {encodeLayout, decodeLayout} = await import('../src/share-link.ts');
  const {sameLayout} = await import('../src/edit.ts');
  const {GRID} = await import('../src/grid.ts');

  it('有阶段时用版本 3，解码还原；阶段 1 不写', () => {
    const p: Layout = {u: 5, list: [['vr200', 0, 3], ['vr200', 1, 3, {phase: 2}], ['cdu', 0, 5, {phase: 3}], ['vr200', 2, 3, {phase: 2, feeds: {coolantSource: [0, 5]}}]]};
    const hash = encodeLayout(p);
    expect(hash).toBe('layout=3,5,vr200:0.3-1.3-2.3,cdu:0.5,@c:2.3_0.5,@2:1.3-2.3,@3:0.5');
    expect(encodeURI(hash)).toBe(hash);
    const back = decodeLayout('#' + hash, CAT, GRID)!;
    expect(back.warnings).toEqual([]);
    expect(sameLayout(back, p)).toBe(true);
  });

  it('版本 2 里的 @2 不认；无效的阶段和位置提示', () => {
    expect(decodeLayout('#layout=2,5,vr200:0.3,@2:0.3', CAT, GRID)!.warnings.length).toBe(1);
    const r = decodeLayout('#layout=3,5,vr200:0.3,@1:0.3,@2:9.9-0.3', CAT, GRID)!;
    expect(r.list).toEqual([['vr200', 0, 3, {phase: 2}]]);
    expect(r.warnings.length).toBe(2);
  });
});

describe('阶段贯穿 USD 和 layout.json', async () => {
  const {buildUsda} = await import('../src/usd-export.ts');
  const {importUsda} = await import('../src/usd-import.ts');
  const {buildLayout} = await import('../src/layout-export.ts');
  const {toEntry, sameLayout} = await import('../src/edit.ts');
  const {GRID} = await import('../src/grid.ts');
  const {propsItems} = await import('../scripts/layout-props-usda.ts');
  const items = propsItems();

  it('USD 只给阶段大于 1 的实例写 dchall:phase，导入后还原阶段和手动指定', () => {
    const usda = buildUsda(items, CAT, 2, GRID, {date: '2026-09-17'});
    expect(usda.match(/int dchall:phase = \d+/g)).toEqual(['int dchall:phase = 2', 'int dchall:phase = 2', 'int dchall:phase = 3']);
    const back = importUsda(usda, CAT, GRID);
    expect(back.warnings).toEqual([]);
    expect(sameLayout(back, {u: 2, list: items.map(toEntry)})).toBe(true);
  });

  it('无效的 dchall:phase 提示并按 1 处理', () => {
    const usda = buildUsda(items, CAT, 2, GRID, {date: '2026-09-17'}).replace('int dchall:phase = 3', 'int dchall:phase = 0');
    const back = importUsda(usda, CAT, GRID);
    expect(back.warnings.length).toBe(1);
    expect(back.list.find(e => e[1] === 9 && e[2] === 5)).toEqual(['rpp', 9, 5]);
  });

  it('layout.json 每台设备都有 phase', () => {
    const eq = buildLayout(items, CAT, 2, GRID, {date: '2026-09-17'}).equipment;
    expect(eq.map(e => e.phase).sort()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3]);
  });
});
