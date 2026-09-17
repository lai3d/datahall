import {describe, expect, it} from 'vitest';
import {compute} from '../src/sim.ts';
import {CAT} from '../src/catalog.ts';
import {supplyLoads, supplyIssues} from '../src/supply.ts';
import type {Loads} from '../src/supply.ts';
import type {Item} from '../src/types.ts';
import {setLang} from '../src/i18n.ts';

// 这里断言中文文案；英文见 i18n.test.ts
setLang('zh');

const at = (type: string, x: number, z: number): Item => ({type, x, z});
const racks = (z: number, xs: number[]) => xs.map(x => at('vr200', x, z));
const check = (list: Item[]) => {
  const loads = supplyLoads(list, CAT);
  return {loads, issues: supplyIssues(loads, compute(list, CAT, 5))};
};
const loadOf = (loads: Loads, x: number, z: number) => [...loads.supplies].find(([it]) => it.x === x && it.z === z)![1];

describe('supplyLoads', () => {
  it('按就近分配累加液冷热量和功率', () => {
    const list = [...racks(3, [0, 1, 2]), at('ib', 3, 3), at('cdu', 0, 5), at('rpp', 1, 5), at('cdu', 15, 5)];
    const {loads} = check(list);
    const cdu = loadOf(loads, 0, 5);
    expect(cdu.loadKw).toBeCloseTo(3 * 190 * .95);
    expect(cdu.consumers).toHaveLength(3);          // IB 是风冷，不接 CDU
    expect(loadOf(loads, 15, 5).loadKw).toBe(0);
    const rpp = loadOf(loads, 1, 5);
    expect(rpp.loadKw).toBe(3 * 190 + 24);
    expect(rpp.consumers).toHaveLength(4);
    expect(rpp.overloaded).toBe(false);
    expect(loads.unconnected).toEqual([]);
  });

  it('没有 CDU、RPP 时列出没接上的设备', () => {
    const {loads} = check([at('vr200', 0, 0), at('ib', 2, 0), at('crah', 4, 0)]);
    expect(loads.unconnected.map(u => [u.item.type, u.needs])).toEqual([['vr200', 'cdu'], ['vr200', 'rpp'], ['ib', 'rpp']]);
  });
});

describe('supplyIssues', () => {
  it('总量够但单台超载时报错', () => {
    // 5 柜 902.5 kW 液冷热量都就近分到左边的 CDU，右边的 CDU 空着
    const list = [...racks(3, [0, 1, 2, 3, 4]), at('cdu', 0, 5), at('cdu', 15, 5), at('rpp', 2, 5), at('rpp', 3, 5)];
    const {loads, issues} = check(list);
    expect(loadOf(loads, 0, 5).overloaded).toBe(true);
    expect(issues).toHaveLength(1);
    expect(issues[0].lvl).toBe('bad');
    expect(issues[0].txt).toMatch(/^CDU（第 1 列第 6 排）超载：分到 5 台设备共 .+ 液冷热量，只能带走 800 kW。/);
  });

  it('总量已经不够时不再逐台重复', () => {
    const list = [...racks(3, [0, 1, 2, 3, 4]), at('cdu', 0, 5), at('rpp', 1, 5)];
    const {loads, issues} = check(list);
    expect(loadOf(loads, 0, 5).overloaded).toBe(true);
    expect(loadOf(loads, 1, 5).overloaded).toBe(true);
    expect(issues).toEqual([]);
  });

  it('超载太多时只列前三台', () => {
    const list = [0, 2, 4, 6].flatMap(z => [...racks(z, [0, 1, 2, 3, 4]), at('cdu', 5, z)]);
    [0, 1, 2, 3, 4].forEach(z => list.push(at('cdu', 15, z)));
    const {issues} = check(list);
    expect(issues.map(i => i.txt.split('：')[0])).toEqual([
      'CDU（第 6 列第 1 排）超载', 'CDU（第 6 列第 3 排）超载', 'CDU（第 6 列第 5 排）超载', '另有 1 台 CDU 超载。']);
  });
});
