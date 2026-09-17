import {afterEach, describe, expect, it} from 'vitest';
import en from '../src/locales/en.js';
import zh from '../src/locales/zh.js';
import {DEFAULT_LANG, getLang, setLang, tr, loc, catName, catNote} from '../src/i18n.js';
import {compute} from '../src/sim.js';
import {supplyLoads, supplyIssues} from '../src/supply.js';
import {decodeLayout} from '../src/share-link.js';
import {importUsda, UsdImportError} from '../src/usd-import.js';
import {CAT, CATALOG} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {buildCases} from '../scripts/capacity-cases.js';
import {readFileSync} from 'node:fs';

afterEach(() => setLang(DEFAULT_LANG));

// 所有函数文案用同一组变量调用，检查不会漏变量（输出里不出现 undefined）
const VARS = {x: 3, z: 4, loc: 'L', n: 2, u: 5, kw: 800, used: 1, total: 2, m: '1.0', need: 'A', cap: 'B', heat: 'C',
  gpus: 7, ports: 8, facility: 'D', load: 'E', label: 'CDU', pct: 85, file: 'f.usda', reason: 'R', v: 'V', type: 'T', cell: 'T:c',
  name: 'N', msg: 'M', gw: 16, gd: 10, cx: .6, cz: 1.2, cur: 'K', diffs: 'P', where: 'W', id: 'I', other: 'O', line: 9,
  c: '"?"', expected: 'X', got: 'Y', open: '(', close: ')', reasons: 'Q', field: 'F', target: 'T', source: 'S'};

describe('文案表', () => {
  it('默认英文', () => expect(DEFAULT_LANG).toBe('en'));

  it('中英文的键相同，类型一致', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) expect(typeof zh[k], k).toBe(typeof en[k]);
  });

  it.each([['en', en], ['zh', zh]])('%s 的函数文案不漏变量', (lang, table) => {
    for (const [k, v] of Object.entries(table)){
      const text = typeof v === 'function' ? v(VARS) : v;
      expect(text, k).not.toMatch(/undefined|NaN|\[object/);
      expect(text.length, k).toBeGreaterThan(0);
    }
  });

  it('英文文案里没有中文', () => {
    for (const [k, v] of Object.entries(en)) expect(typeof v === 'function' ? v(VARS) : v, k).not.toMatch(/[一-鿿]/);
  });

  it('缺键时报错，未知语言不切换', () => {
    expect(() => tr('nope')).toThrow(/nope/);
    setLang('fr');
    expect(getLang()).toBe('en');
  });
});

describe('英文输出', () => {
  it('位置、单复数', () => {
    expect(loc(0, 2)).toBe('column 1, row 3');
    expect(tr('shareCopied', {n: 1})).toBe('Link copied (1 device).');
    expect(tr('overloadMore', {n: 2, label: 'RPP'})).toBe('2 more RPPs are overloaded.');
  });

  it('容量问题', () => {
    const s = compute([{type: 'vr200', x: 0, z: 0}], CAT, 2);
    expect(s.issues.map(i => i.txt)).toEqual([
      'Not enough power distribution: racks need 190 kW, RPPs can distribute only 0 kW. Add an RPP.',
      'Not enough liquid cooling: 181 kW of heat, CDUs can remove only 0 kW. Add a CDU.',
      'Not enough air cooling: 10 kW of heat, air handlers can remove only 0 kW. Add an in-row cooler.',
      'Not enough back-end network: 72 GPUs, only 0 ports. Add an IB switch rack.',
    ]);
  });

  it('逐台超载', () => {
    const list = [0, 1, 2, 3, 4].map(x => ({type: 'vr200', x, z: 3}));
    list.push({type: 'cdu', x: 0, z: 5}, {type: 'cdu', x: 15, z: 5}, {type: 'rpp', x: 2, z: 5}, {type: 'rpp', x: 3, z: 5});
    const [issue] = supplyIssues(supplyLoads(list, CAT), compute(list, CAT, 5));
    expect(issue.txt).toMatch(/^CDU \(column 1, row 6\) is overloaded: 5 devices assigned, .+ of liquid-cooling heat, but it can remove only 800 kW\./);
  });

  it('分享链接和导入的提示', () => {
    expect(decodeLayout('#layout=1,5,vr200:99.0', CAT, GRID).warnings).toEqual(['Vera Rubin NVL72 at column 100, row 1 is outside the grid. Skipped.']);
    expect(() => importUsda('#usda 1.0\ndef Xform "DataHall" {', CAT, GRID)).toThrow(UsdImportError);
    try { importUsda('#usda 1.0\ndef Xform "DataHall" {', CAT, GRID); } catch (e) { expect(e.message).toMatch(/^the file is malformed\. Line \d+: /); }
  });
});

describe('设备目录', () => {
  it('每个设备都有英文说明，名称和说明都不含中文', () => {
    for (const t of CATALOG){
      expect(t.i18n?.en?.note, t.id).toBeTruthy();
      expect(catName(t), t.id).not.toMatch(/[一-鿿]/);
      expect(catNote(t), t.id).not.toMatch(/[一-鿿]/);
    }
  });

  it('中文回退到原文', () => {
    setLang('zh');
    expect(catName(CAT.stor)).toBe(CAT.stor.name);
    expect(catNote(CAT.cdu)).toBe(CAT.cdu.note);
  });
});

it('容量用例保持中文，和 spec/capacity-cases.json 一致（Unity 逐字比对）', () => {
  const cases = buildCases();
  expect(getLang()).toBe('en');
  const file = JSON.parse(readFileSync(new URL('../../spec/capacity-cases.json', import.meta.url), 'utf8'));
  expect(JSON.parse(JSON.stringify(cases))).toEqual(file.cases);
});
