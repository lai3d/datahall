import {describe, expect, it} from 'vitest';
import {encodeLayout, decodeLayout} from '../src/share-link.js';
import {CAT, CATALOG} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {PRESETS} from '../src/layout.js';

const sortCells = list => [...list].sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]));

describe('encodeLayout / decodeLayout', () => {
  it.each([...Object.entries(PRESETS).filter(([k]) => k !== 'empty'), ['每种设备各一台', {u: 10, list: CATALOG.map((t, i) => [t.id, i, 9])}]])(
    '%s：编码后解码得到同样的布局，且无需 URL 转义', (name, p) => {
      const hash = encodeLayout(p);
      expect(hash).toMatch(/^layout=1,/);
      expect(encodeURI(hash)).toBe(hash);
      const back = decodeLayout('#' + hash, CAT, GRID);
      expect(back.warnings).toEqual([]);
      expect(back.u).toBe(p.u);
      expect(sortCells(back.list)).toEqual(sortCells(p.list));
    });

  it('按类型分组，格式可读', () => {
    expect(encodeLayout({u: 5, list: [['vr200', 3, 3], ['cdu', 3, 5], ['vr200', 4, 3]]})).toBe('layout=1,5,vr200:3.3-4.3,cdu:3.5');
  });

  it('GB200 预设的链接长度适合分享', () => {
    expect(encodeLayout(PRESETS.gb200).length).toBeLessThan(160);
  });

  it('空机房编码为空；没有布局参数时返回 null；小数市电保留', () => {
    expect(encodeLayout({u: 2, list: []})).toBe('');
    expect(decodeLayout('', CAT, GRID)).toBeNull();
    expect(decodeLayout('#other=1', CAT, GRID)).toBeNull();
    expect(decodeLayout('#layout=1,2.5', CAT, GRID)).toEqual({u: 2.5, list: [], warnings: []});
  });

  it('无效内容跳过并逐条提示', () => {
    const r = decodeLayout('#layout=1,0,vr200:1.1-1.1-99.0-x.y,nope:0.0,cdu:2.2', CAT, GRID);
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

  it('不支持的版本不载入', () => {
    expect(decodeLayout('#layout=2,5,vr200:1.1', CAT, GRID)).toEqual({u: 2, list: [], warnings: ['分享链接的版本 2 不受支持，没有载入布局。']});
  });
});
