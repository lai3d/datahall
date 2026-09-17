import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.js';
import {CAT} from '../src/catalog.js';
import {GRID} from '../src/grid.js';

const SAMPLE = readFileSync(new URL('../../samples/datahall.usda', import.meta.url), 'utf8');

// 从样例里反解设备清单（按出现顺序）和市电容量
function parseSample(src){
  const list = [...src.matchAll(/references = <\/DataHall\/Catalog\/(\w+)>[\s\S]*?gridColumn = (\d+)\s+custom int dchall:gridRow = (\d+)/g)]
    .map(m => ({type: m[1], x: +m[2], z: +m[3]}));
  return {list, utility: +src.match(/dchall:utilityMw = ([\d.]+)/)[1]};
}

describe('buildUsda', () => {
  it('重新生成的样例与 samples/datahall.usda 逐字节一致', () => {
    const {list, utility} = parseSample(SAMPLE);
    expect(list.length).toBe(17);
    expect(buildUsda(list, CAT, utility, GRID)).toBe(SAMPLE);
  });

  it('关系目标都指向存在的设备 prim', () => {
    const {list, utility} = parseSample(SAMPLE);
    const out = buildUsda(list, CAT, utility, GRID);
    const defined = new Set([...out.matchAll(/def Xform "(R\d\d_C\d\d)"/g)].map(m => m[1]));
    const targets = [...out.matchAll(/rel dchall:\w+ = <\/DataHall\/Equipment\/(\w+)>/g)].map(m => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach(t => expect(defined).toContain(t));
  });

  it('空机房也能导出合法的层头和空 Scope', () => {
    const out = buildUsda([], CAT, 2, GRID);
    expect(out).toMatch(/^#usda 1\.0\n/);
    expect(out).toContain('defaultPrim = "DataHall"');
    expect(out).toContain('def Scope "Equipment"\n    {\n    }');
  });

  it('忽略目录里不存在的设备类型', () => {
    const out = buildUsda([{type: 'nope', x: 0, z: 0}], CAT, 2, GRID);
    expect(out).not.toContain('nope');
  });
});
