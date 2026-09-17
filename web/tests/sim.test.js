import {describe, expect, it} from 'vitest';
import {compute, fmt} from '../src/sim.js';
import {CAT, CATALOG} from '../src/catalog.js';
import {GRID, keyOf} from '../src/grid.js';
import {PRESETS} from '../src/layout.js';
import {supplyLoads, supplyIssues} from '../src/supply.js';
import {setLang} from '../src/i18n.js';

// 这里断言中文文案；英文见 i18n.test.js
setLang('zh');

const toList = p => p.list.map(([type, x, z]) => ({type, x, z}));

describe('compute', () => {
  it('GB200 预设的负载与 PUE', () => {
    const s = compute(toList(PRESETS.gb200), CAT, PRESETS.gb200.u);
    expect(s.it).toBe(1048);
    expect(s.gpus).toBe(576);
    expect(s.liqHeat).toBeCloseTo(850);
    expect(s.airHeat).toBeCloseTo(198);
    // 1048 + 42 + 850×0.08 + 198×0.30 + 1048×0.05
    expect(s.facility).toBeCloseTo(1269.8);
    expect(s.pue).toBeCloseTo(1269.8 / 1048);
    expect(s.blocking).toBe(false);
  });

  it('单个 GPU 柜没有配套设施时，四项约束都报错', () => {
    const s = compute([{type: 'gb200', x: 0, z: 0}], CAT, 2);
    expect(s.issues.filter(i => i.lvl === 'bad').map(i => i.txt.slice(0, 4)))
      .toEqual(['配电不足', '液冷不足', '风冷不足', '后端网络']);
    expect(s.blocking).toBe(true);
  });

  it('超出市电', () => {
    const s = compute(Array.from({length: 4}, () => ({type: 'kyber'})), CAT, 2);
    expect(s.issues.some(i => i.txt.startsWith('超出市电'))).toBe(true);
    expect(s.future).toBe(true);
  });

  it('空机房', () => {
    const s = compute([], CAT, 2);
    expect(s.it).toBe(0);
    expect(s.pue).toBe(0);
    expect(s.blocking).toBe(false);
  });
});

describe('预设', () => {
  it.each(Object.entries(PRESETS).filter(([k]) => k !== 'empty'))('%s 可以直接通电', (name, p) => {
    expect(compute(toList(p), CAT, p.u).blocking).toBe(false);
  });

  it.each(Object.entries(PRESETS).filter(([k]) => k !== 'empty'))('%s 每台 CDU、RPP 都不超载，设备都接上了', (name, p) => {
    const loads = supplyLoads(toList(p), CAT);
    expect(supplyIssues(loads, compute(toList(p), CAT, p.u))).toEqual([]);
    expect([...loads.supplies.values()].some(s => s.overloaded)).toBe(false);
    expect(loads.unconnected).toEqual([]);
  });

  it.each(Object.entries(PRESETS))('%s 的设备类型存在、在网格内、不重叠', (name, p) => {
    const seen = new Set();
    p.list.forEach(([t, x, z]) => {
      expect(CAT[t]).toBeDefined();
      expect(x >= 0 && x < GRID.GW && z >= 0 && z < GRID.GD).toBe(true);
      expect(seen.has(keyOf(x, z))).toBe(false);
      seen.add(keyOf(x, z));
    });
  });
});

describe('catalog', () => {
  it('id 唯一，颜色变量是固定语义之一', () => {
    expect(new Set(CATALOG.map(t => t.id)).size).toBe(CATALOG.length);
    CATALOG.forEach(t => expect(['--gpu', '--net', '--store', '--coolant', '--air', '--copper']).toContain(t.c));
  });
});

it('fmt', () => {
  expect(fmt(999.6)).toBe('1000 kW');
  expect(fmt(1269.8)).toBe('1.27 MW');
});

describe('spec/capacity-cases.json', () => {
  it('和当前 sim.js、catalog.json 的计算结果一致（不一致时运行 npm run capacity-cases）', async () => {
    const {readFileSync} = await import('node:fs');
    const {buildCases, CASES_PATH} = await import('../scripts/capacity-cases.js');
    const file = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
    expect(file.cases).toEqual(buildCases());
    expect(file.cases.length).toBe(Object.keys(PRESETS).length + 4);   // 每个预设一条，另有 4 条特例
    expect(file.cases.some(c => c.expected.blocking) && file.cases.some(c => !c.expected.blocking)).toBe(true);
  });
});
