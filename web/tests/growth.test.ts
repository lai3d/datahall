import {describe, expect, it} from 'vitest';
import {compute} from '../src/sim.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {phasesIn, growthPlan, headroom, utilization} from '../src/growth.ts';
import {PRESETS} from '../src/layout.ts';
import {toItems} from '../src/edit.ts';
import type {Item, Layout} from '../src/types.ts';

const at = (type: string, x: number, z: number, phase?: number): Item => phase ? {type, x, z, phase} : {type, x, z};

describe('growthPlan', () => {
  // Phase 1: 4 GB200 racks and facilities; phase 2 adds 4 more racks and liquid cooling runs short
  const items = [
    ...[0, 1, 2, 3].map(x => at('gb200', x, 3)), at('cdu', 0, 5), at('rpp', 1, 5), at('ib', 2, 5), at('crah', 3, 5),
    ...[4, 5, 6, 7].map(x => at('gb200', x, 3, 2)),
  ];

  it('phases in ascending order, defaulting to 1', () => {
    expect(phasesIn(items)).toEqual([1, 2]);
    expect(phasesIn([])).toEqual([]);
  });

  it('accumulates per phase, finds the tightest constraint and the reasons for failures', () => {
    const [p1, p2] = growthPlan(items, CAT, 2);
    expect([p1.phase, p1.count, p1.gpus, p1.reasons]).toEqual([1, 8, 288, []]);
    expect(p1.tightest).toEqual({kind: 'network', ratio: 1});   // 288 GPUs exactly fill one IB switch's 288 ports
    expect(p1.util.liquid).toBeCloseTo(425 / 800);
    expect([p2.phase, p2.count, p2.gpus]).toEqual([2, 12, 576]);
    expect(p2.reasons.map(r => r.kind)).toEqual(['dist', 'liquid', 'air', 'network']);
    expect(p2.tightest).toEqual({kind: 'network', ratio: 2});
  });

  it('a preset without phase info has one phase matching compute', () => {
    const p = PRESETS.rubin;
    const plan = growthPlan(toItems(p.list), CAT, p.u);
    expect(plan.length).toBe(1);
    expect(plan[0].itKw).toBe(compute(toItems(p.list), CAT, p.u).it);
    expect(plan[0].reasons).toEqual([]);
  });

  it('constraints with zero capacity are recorded as Infinity', () => {
    const u = utilization(compute([at('vr200', 0, 0)], CAT, 2), 2);
    expect(u.dist).toBe(Infinity);
    expect(utilization(compute([], CAT, 2), 2).dist).toBe(0);
  });
});

describe('headroom', () => {
  it('adding the computed count still fits, one more does not (every GPU rack type, every preset)', () => {
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

  it('returns 0 units for constraints already exceeded', () => {
    expect(headroom([at('vr200', 0, 0)], CAT, 2, 'vr200')).toEqual({limit: 'dist', count: 0});
  });
});

describe('phases in share links', async () => {
  const {encodeLayout, decodeLayout} = await import('../src/share-link.ts');
  const {sameLayout} = await import('../src/edit.ts');
  const {GRID} = await import('../src/grid.ts');

  it('uses version 3 with phases and decodes them back; phase 1 is not written', () => {
    const p: Layout = {u: 5, list: [['vr200', 0, 3], ['vr200', 1, 3, {phase: 2}], ['cdu', 0, 5, {phase: 3}], ['vr200', 2, 3, {phase: 2, feeds: {coolantSource: [0, 5]}}]]};
    const hash = encodeLayout(p);
    expect(hash).toBe('layout=3,5,vr200:0.3-1.3-2.3,cdu:0.5,@c:2.3_0.5,@2:1.3-2.3,@3:0.5');
    expect(encodeURI(hash)).toBe(hash);
    const back = decodeLayout('#' + hash, CAT, GRID)!;
    expect(back.warnings).toEqual([]);
    expect(sameLayout(back, p)).toBe(true);
  });

  it('@2 is not recognized in version 2; invalid phases and positions warn', () => {
    expect(decodeLayout('#layout=2,5,vr200:0.3,@2:0.3', CAT, GRID)!.warnings.length).toBe(1);
    const r = decodeLayout('#layout=3,5,vr200:0.3,@1:0.3,@2:9.9-0.3', CAT, GRID)!;
    expect(r.list).toEqual([['vr200', 0, 3, {phase: 2}]]);
    expect(r.warnings.length).toBe(2);
  });
});

describe('phases across USD and layout.json', async () => {
  const {buildUsda} = await import('../src/usd-export.ts');
  const {importUsda} = await import('../src/usd-import.ts');
  const {buildLayout} = await import('../src/layout-export.ts');
  const {toEntry, sameLayout} = await import('../src/edit.ts');
  const {GRID} = await import('../src/grid.ts');
  const {propsItems} = await import('../scripts/layout-props-usda.ts');
  const items = propsItems();

  it('USD writes dchall:phase only for instances above phase 1; import restores phases and manual assignments', () => {
    const usda = buildUsda(items, CAT, 2, GRID, {date: '2026-09-17'});
    expect(usda.match(/int dchall:phase = \d+/g)).toEqual(['int dchall:phase = 2', 'int dchall:phase = 2', 'int dchall:phase = 3']);
    const back = importUsda(usda, CAT, GRID);
    expect(back.warnings).toEqual([]);
    expect(sameLayout(back, {u: 2, list: items.map(toEntry)})).toBe(true);
  });

  it('invalid dchall:phase warns and is treated as 1', () => {
    const usda = buildUsda(items, CAT, 2, GRID, {date: '2026-09-17'}).replace('int dchall:phase = 3', 'int dchall:phase = 0');
    const back = importUsda(usda, CAT, GRID);
    expect(back.warnings.length).toBe(1);
    expect(back.list.find(e => e[1] === 9 && e[2] === 5)).toEqual(['rpp', 9, 5]);
  });

  it('every device in layout.json has a phase', () => {
    const eq = buildLayout(items, CAT, 2, GRID, {date: '2026-09-17'}).equipment;
    expect(eq.map(e => e.phase).sort()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3]);
  });
});
