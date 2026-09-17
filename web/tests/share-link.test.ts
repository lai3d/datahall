import {describe, expect, it} from 'vitest';
import {encodeLayout, decodeLayout} from '../src/share-link.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {PRESETS} from '../src/layout.ts';
import type {Entry, Layout} from '../src/types.ts';
import {setLang} from '../src/i18n.ts';

// Asserts Chinese messages here; English is covered in i18n.test.ts
setLang('zh');

const sortCells = (list: Entry[]) => [...list].sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]));

describe('encodeLayout / decodeLayout', () => {
  it.each([...Object.entries(PRESETS).filter(([k]) => k !== 'empty'), ['every device type once', {u: 10, list: CATALOG.map((t, i): Entry => [t.id, i, 9])} as Layout]])(
    '%s: encode then decode yields the same layout without URL escaping', (name, p) => {
      const hash = encodeLayout(p);
      expect(hash).toMatch(/^layout=1,/);
      expect(encodeURI(hash)).toBe(hash);
      const back = decodeLayout('#' + hash, CAT, GRID)!;
      expect(back.warnings).toEqual([]);
      expect(back.u).toBe(p.u);
      expect(sortCells(back.list)).toEqual(sortCells(p.list));
    });

  it('grouped by type in a readable format', () => {
    expect(encodeLayout({u: 5, list: [['vr200', 3, 3], ['cdu', 3, 5], ['vr200', 4, 3]]})).toBe('layout=1,5,vr200:3.3-4.3,cdu:3.5');
  });

  it('GB200 preset link is short enough to share', () => {
    expect(encodeLayout(PRESETS.gb200).length).toBeLessThan(160);
  });

  it('empty hall encodes as empty; returns null without a layout parameter; fractional utility power is kept', () => {
    expect(encodeLayout({u: 2, list: []})).toBe('');
    expect(decodeLayout('', CAT, GRID)).toBeNull();
    expect(decodeLayout('#other=1', CAT, GRID)).toBeNull();
    expect(decodeLayout('#layout=1,2.5', CAT, GRID)).toEqual({u: 2.5, list: [], warnings: []});
  });

  it('skips invalid content with a warning for each', () => {
    const r = decodeLayout('#layout=1,0,vr200:1.1-1.1-99.0-x.y,nope:0.0,cdu:2.2', CAT, GRID)!;
    expect(r.u).toBe(2);
    expect(r.list).toEqual([['vr200', 1, 1], ['cdu', 2, 2]]);
    expect(r.warnings).toEqual([
      '分享链接里的市电容量无效，按 2 MW 载入。',
      'Vera Rubin NVL72 和其他设备占用同一格（第 2 列第 2 排），已跳过。',
      'Vera Rubin NVL72 的位置（第 100 列第 1 排）超出网格，已跳过。',
      '分享链接里的位置 vr200:x.y 格式不对，已跳过。',
      '分享链接里的设备类型 nope 不在当前目录里，已跳过。',
    ]);
  });

  it('does not load unsupported versions', () => {
    expect(decodeLayout('#layout=4,5,vr200:1.1', CAT, GRID)).toEqual({u: 2, list: [], warnings: ['分享链接的版本 4 不受支持，没有载入布局。']});
  });
});
