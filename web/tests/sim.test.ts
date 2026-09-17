import {describe, expect, it} from 'vitest';
import {compute, fmt} from '../src/sim.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID, keyOf} from '../src/grid.ts';
import {PRESETS} from '../src/layout.ts';
import {toItems} from '../src/edit.ts';
import type {Layout} from '../src/types.ts';
import {supplyLoads, supplyIssues} from '../src/supply.ts';
import {setLang} from '../src/i18n.ts';

// Asserts Chinese messages here; English is covered in i18n.test.ts
setLang('zh');

const toList = (p: Layout) => toItems(p.list);

describe('compute', () => {
  it('GB200 preset load and PUE', () => {
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

  it('a lone GPU rack without facilities fails all four constraints', () => {
    const s = compute([{type: 'gb200', x: 0, z: 0}], CAT, 2);
    expect(s.issues.filter(i => i.lvl === 'bad').map(i => i.txt.slice(0, 4)))
      .toEqual(['配电不足', '液冷不足', '风冷不足', '后端网络']);
    expect(s.blocking).toBe(true);
  });

  it('exceeds utility power', () => {
    const s = compute(Array.from({length: 4}, (_, x) => ({type: 'kyber', x, z: 0})), CAT, 2);
    expect(s.issues.some(i => i.txt.startsWith('超出市电'))).toBe(true);
    expect(s.future).toBe(true);
  });

  it('empty hall', () => {
    const s = compute([], CAT, 2);
    expect(s.it).toBe(0);
    expect(s.pue).toBe(0);
    expect(s.blocking).toBe(false);
  });
});

describe('presets', () => {
  it.each(Object.entries(PRESETS).filter(([k]) => k !== 'empty'))('%s can power on as is', (name, p) => {
    expect(compute(toList(p), CAT, p.u).blocking).toBe(false);
  });

  it.each(Object.entries(PRESETS).filter(([k]) => k !== 'empty'))('%s has no overloaded CDU or RPP and every device is connected', (name, p) => {
    const loads = supplyLoads(toList(p), CAT);
    expect(supplyIssues(loads, compute(toList(p), CAT, p.u))).toEqual([]);
    expect([...loads.supplies.values()].some(s => s.overloaded)).toBe(false);
    expect(loads.unconnected).toEqual([]);
  });

  it.each(Object.entries(PRESETS))('%s device types exist, fit in the grid and do not overlap', (name, p) => {
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
  it('ids are unique and color variables are one of the fixed semantics', () => {
    expect(new Set(CATALOG.map(t => t.id)).size).toBe(CATALOG.length);
    CATALOG.forEach(t => expect(['--gpu', '--net', '--store', '--coolant', '--air', '--copper']).toContain(t.c));
  });
});

it('fmt', () => {
  expect(fmt(999.6)).toBe('1000 kW');
  expect(fmt(1269.8)).toBe('1.27 MW');
});

describe('spec/capacity-cases.json', () => {
  it('matches the current sim.ts and catalog.json results (run npm run capacity-cases if not)', async () => {
    const {readFileSync} = await import('node:fs');
    const {buildCases, CASES_PATH} = await import('../scripts/capacity-cases.ts');
    const file = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
    expect(file.cases).toEqual(buildCases());
    expect(file.cases.length).toBe(Object.keys(PRESETS).length + 4);   // One per preset plus 4 special cases
    type Case = {expected: {blocking: boolean}};
    expect(file.cases.some((c: Case) => c.expected.blocking) && file.cases.some((c: Case) => !c.expected.blocking)).toBe(true);
  });
});
