import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {buildLayout, layoutToText} from '../src/layout-export.js';
import {buildUsda} from '../src/usd-export.js';
import {importUsda} from '../src/usd-import.js';
import {CAT, CATALOG} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {PRESETS} from '../src/layout.js';
import {readSample} from '../scripts/sample.js';

const META = {date: '2026-09-17'};
const schema = JSON.parse(readFileSync(new URL('../../spec/layout.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);
const toItems = list => list.map(([type, x, z]) => ({type, x, z}));

describe('buildLayout', () => {
  it.each([...Object.entries(PRESETS), ['每种设备各一台', {u: 10, list: CATALOG.map((t, i) => [t.id, i, 9])}]])(
    '%s 符合 spec/layout.schema.json', (name, p) => {
      const layout = buildLayout(toItems(p.list), CAT, p.u, GRID, META);
      expect(validate(layout), JSON.stringify(validate.errors)).toBe(true);
      expect(layout.equipment.length).toBe(p.list.length);
    });

  it('样例：拓扑关系和 USD 导出里的 relationship 完全一致', () => {
    const {u, list} = importUsda(readSample(), CAT, GRID);
    const layout = buildLayout(toItems(list), CAT, u, GRID, META);
    const usda = buildUsda(toItems(list), CAT, u, GRID, META);
    for (const e of layout.equipment){
      const block = usda.slice(usda.indexOf(`def Xform "${e.name}"`));
      const body = block.slice(0, block.indexOf('\n        }'));
      const rel = name => body.match(new RegExp(`rel dchall:${name} = </DataHall/Equipment/(\\w+)>`))?.[1] || '';
      expect([e.name, e.powerFeed, e.coolantSource]).toEqual([e.name, rel('powerFeed'), rel('coolantSource')]);
    }
    expect(layout.equipment.filter(e => e.coolantSource).length).toBeGreaterThan(0);
  });

  it('目录只列出用到的设备类型，参数取自 catalog.json', () => {
    const layout = buildLayout(toItems([['vr200', 0, 0], ['cdu', 1, 0], ['vr200', 2, 0]]), CAT, 5, GRID, META);
    expect(layout.catalog.map(c => c.id)).toEqual(['vr200', 'cdu']);
    expect(layout.catalog[0]).toMatchObject({name: 'Vera Rubin NVL72', category: 'gpu', powerKw: 190, gpuCount: 72, liquidFraction: 0.95, heightM: 2.3, roadmap: false});
    expect(layout.catalog[1]).toMatchObject({liquidCoolingKw: 800, overheadKw: 12, powerKw: 0, liquidFraction: 0});
    expect(layout.equipment[0]).toEqual({name: 'R01_C01', type: 'vr200', column: 0, row: 0, powerFeed: '', coolantSource: 'R01_C02'});
  });

  it('跳过目录里没有的类型；缺日期报错；文本以换行结尾', () => {
    const layout = buildLayout(toItems([['nope', 0, 0], ['rpp', 1, 1]]), CAT, 2, GRID, META);
    expect(layout.equipment.map(e => e.type)).toEqual(['rpp']);
    expect(() => buildLayout([], CAT, 2, GRID)).toThrow(/meta.date/);
    expect(layoutToText(layout).endsWith('}\n')).toBe(true);
  });
});
