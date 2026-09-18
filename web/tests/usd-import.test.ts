import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseUsda, UsdaSyntaxError} from '../src/usda-parser.ts';
import {importUsda, UsdImportError} from '../src/usd-import.ts';
import {buildUsda} from '../src/usd-export.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {toItems} from '../src/edit.ts';
import type {Entry, Layout} from '../src/types.ts';
import {PRESETS} from '../src/layout.ts';
import {parseSampleLayout, readSample} from '../scripts/sample.ts';
import {setLang} from '../src/i18n.ts';

// These tests assert the Chinese messages; English output is covered in i18n.test.ts
setLang('zh');

const META = {date: '2026-09-17'};
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.usda`, import.meta.url), 'utf8');
const imp = (text: string) => importUsda(text, CAT, GRID);
const exportList = (list: Entry[], u: number) => buildUsda(toItems(list), CAT, u, GRID, META);
const sampleList = () => parseSampleLayout(readSample()).list.map((i): Entry => [i.type, i.x, i.z]);

describe('parseUsda', () => {
  it('comments, single and double quotes, triple-quoted strings, escapes', () => {
    const layer = parseUsda(`#usda 1.0
(
    """layer doc
    # not a comment"""
    customLayerData = {
        string a = "x \\"y\\" # z"   # trailing comment
        string 'b' = 'single'
    }
)
# comment on its own line
def "P" {}
`);
    expect(layer.metadata.doc).toBe('layer doc\n    # not a comment');
    expect(layer.metadata.customLayerData).toEqual({a: 'x "y" # z', b: 'single'});
    expect(layer.prims.map(p => p.name)).toEqual(['P']);
  });

  it('list ops, external references, layer offsets, timeSamples, -inf, connections', () => {
    const layer = parseUsda(`#usda 1.0
(
    subLayers = [@./a.usda@ (offset = 1; scale = 2), @b.usda@]
)
def Xform "P" (
    prepend references = [@./rack.usd@</rack>, </Local>]
    delete apiSchemas = ["X"]
    active = false
)
{
    custom uniform token[] t = ["a", "b"]
    double3 xformOp:translate.timeSamples = {
        0: (1, 2, 3),
        10: (4, 5, 6),
    }
    float f = -inf
    color3f inputs:c.connect = </P/S.outputs:rgb>
    rel r
    normal3f[] normals = [(0, 0, 1)] (
        interpolation = "faceVarying"
    )
}
`);
    expect(layer.metadata.subLayers).toEqual([{asset: './a.usda'}, {asset: 'b.usda'}]);
    const p = layer.prims[0];
    expect(p.metadata.references).toEqual({op: 'prepend', value: [{asset: './rack.usd', path: '/rack'}, {path: '/Local'}]});
    expect(p.metadata.apiSchemas).toEqual({op: 'delete', value: ['X']});
    expect(p.metadata.active).toBe(false);
    expect(p.props.t).toMatchObject({type: 'token[]', custom: true, value: ['a', 'b']});
    expect(p.props['xformOp:translate'].timeSamples).toEqual({0: [1, 2, 3], 10: [4, 5, 6]});
    expect(p.props.f.value).toBe(-Infinity);
    expect(p.props['inputs:c'].connect).toEqual({path: '/P/S.outputs:rgb'});
    expect(p.props.r).toMatchObject({type: 'rel'});
    expect(p.props.normals.metadata).toEqual({interpolation: 'faceVarying'});
  });

  it('skips variantSet and reorder', () => {
    const layer = parseUsda(`#usda 1.0
def "P" (
    variants = { string look = "a" }
    prepend variantSets = "look"
)
{
    reorder nameChildren = ["B", "A"]
    variantSet "look" = {
        "a" { def "Inside" {} }
    }
    def "A" {}
    int x = 1
}
`);
    const p = layer.prims[0];
    expect(p.children.map(c => c.name)).toEqual(['A']);
    expect(p.props.x.value).toBe(1);
    expect(p.metadata.variants).toEqual({look: 'a'});
  });

  it('syntax errors include the line number', () => {
    expect(() => parseUsda('#usda 1.0\ndef "P" {\n  int x = \n}\n')).toThrow(UsdaSyntaxError);
    expect(() => parseUsda('#usda 1.0\ndef "P" {\n  int x = \n}\n')).toThrow(/第 4 行/);
    expect(() => parseUsda('#usda 1.0\ndef "P" {\n  string s = "abc\n}\n')).toThrow(/第 3 行：字符串没有结束/);
    expect(() => parseUsda('not usd')).toThrow(/缺少 #usda 文件头/);
  });
});

describe('importUsda', () => {
  it('imports samples/datahall.usda as the sample layout with no warnings', () => {
    const r = imp(readSample());
    expect(r).toEqual({u: 5, list: sampleList(), warnings: [], skipped: 0});
  });

  it.each([...Object.entries(PRESETS), ['every device type once', {u: 10, list: CATALOG.map((t, i): Entry => [t.id, i, 9])}] as [string, Layout]])(
    '%s: export then import gives the same layout, and re-export is byte-identical', (name, p) => {
      const text = exportList(p.list, p.u);
      const r = imp(text);
      expect(r.warnings).toEqual([]);
      expect(r.list).toEqual(p.list);
      expect(r.u).toBe(p.u);
      expect(exportList(r.list, r.u)).toBe(text);
    });

  it('warns when the file came from a different catalog version', () => {
    const older = fixture('pxr-resaved').replace(/string "dchall:catalogVersion" = "[^"]*"/, 'string "dchall:catalogVersion" = "2000-01-01"');
    const r = imp(older);
    expect(r.warnings[0]).toContain('2000-01-01');
    expect(r.list).toEqual(sampleList());
  });

  it('a file re-saved by pxr (reordered fields, different number formatting) imports the same', () => {
    expect(imp(fixture('pxr-resaved'))).toEqual({u: 5, list: sampleList(), warnings: [], skipped: 0});
  });

  it('old schema 0.1 files (custom attributes, no apiSchemas) still import', () => {
    // The file keeps the catalog values of its time; later catalog corrections show up as parameter differences
    expect(imp(fixture('schema-0.1'))).toEqual({u: 5, list: sampleList(), skipped: 0, warnings: [
      'Vera Rubin NVL72 的参数和当前目录不同（liquidFraction 0.95 → 1），按当前目录计算。',
      'Vera Rubin Ultra NVL144 (Kyber) 的参数和当前目录不同（capexMusd 9 → 8.8），按当前目录计算。',
    ]});
  });

  it('a file edited with pxr: placed by grid column and row, invalid equipment skipped with one warning each', () => {
    const r = imp(fixture('pxr-edited'));
    const expected = sampleList()
      .map(([t, x, z]) => [t, x === 3 && z === 3 && t === 'vr200' ? 0 : x, z])   // R04_C04 moved to column 1
      .filter(([t, x, z]) => !(t === 'cdu' && x === 3 && z === 5));             // R06_C04 deactivated
    expect(r.list).toEqual([...expected, ['crah', 15, 9]]);
    expect(r.skipped).toBe(5);
    expect(r.warnings).toEqual([
      'Vera Rubin NVL72 的参数和当前目录不同（powerKw 230 → 190），按当前目录计算。',
      'R04_C04 的 xformOp:translate 和第 1 列第 4 排的位置不一致，按 dchall:gridColumn / gridRow 放置。',
      'R04_C05 的 xformOp:translate 和第 5 列第 4 排的位置不一致，按 dchall:gridColumn / gridRow 放置。',
      'R06_C04 已停用（active = false），未导入。',
      'R10_C01 的设备类型 nope 不在当前目录里，未导入。',
      'R08_C16 和 R08_C15 占用同一格（第 15 列第 8 排），未导入。',
      'R11_C01 的位置（第 1 列第 11 排）超出网格，未导入。',
      'R01_C01 没有引用 /DataHall/Catalog 下的设备原型，未导入。',
      'R04_C04 的 dchall:coolantSource 指向 R06_C04，它没有作为对应的供给设备导入，改为就近。',
    ]);
  });

  it('missing utility and grid attributes fall back to defaults with warnings; missing column and row are inferred from the name', () => {
    const text = exportList([['gb200', 2, 1]], 5)
      .replace(/    double dchall:utilityMw = .*\n/, '')
      .replace(/    int dchall:gridColumns = .*\n/, '')
      .replace(/            int dchall:gridColumn = .*\n/, '');
    const r = imp(text);
    expect(r.u).toBe(2);
    expect(r.list).toEqual([['gb200', 2, 1]]);
    expect(r.warnings).toEqual([
      '文件没有 dchall:gridColumns，按 16 列 × 10 排、0.6 m × 1.2 m 的网格导入。',
      '文件没有有效的 dchall:utilityMw，市电容量按 2 MW 导入。',
      'R02_C03 没有 dchall:gridColumn / gridRow，按名字放在第 3 列第 2 排。',
    ]);
  });

  it('files that cannot be imported give a clear reason', () => {
    const errors: [string, RegExp][] = [
      ['PXR-USDC\u0000\u0000binary', /二进制 .usd（usdc）/],
      ['{"not": "usd"}', /文件格式有误.*缺少 #usda 文件头/],
      ['#usda 1.0\ndef Xform "World" {}\n', /没有找到 \/DataHall/],
      [exportList([], 2).replace('dchall:gridColumns = 16', 'dchall:gridColumns = 20'), /网格 dchall:gridColumns = 20.*无法导入/],
      [exportList([], 2).replace('def Scope "Equipment" (', 'def Scope "Equipment" ((('), /文件格式有误，第 \d+ 行/],
    ];
    for (const [text, message] of errors){
      expect(() => imp(text)).toThrow(UsdImportError);
      expect(() => imp(text)).toThrow(message);
    }
  });
});
