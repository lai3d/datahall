import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.js';
import {CAT, CATALOG} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {parseSampleLayout, readSample} from '../scripts/sample.js';

const SAMPLE = readSample();
const GENERATED_SCHEMA = readFileSync(new URL('../../schema/generatedSchema.usda', import.meta.url), 'utf8');

// generatedSchema.usda → {APIName: {propName: 'double' | 'rel' | ...}}
function parseSchema(src){
  const out = {};
  let cur = null;
  for (const line of src.split('\n')){
    const cls = line.match(/^class "(\w+)"/);
    if (cls){ cur = out[cls[1]] = {}; continue; }
    const prop = cur && line.match(/^    (?:uniform )?(\w+(?:\[\])?) (dchall:\w+)/);
    if (prop) cur[prop[2]] = prop[1];
  }
  return out;
}

// 导出层 → 每个 prim 的路径、应用的 schema（含引用原型上的）和写出的 dchall: 属性
function parseLayer(src){
  const prims = [], stack = [];
  let pending = null;
  for (const raw of src.split('\n')){
    const line = raw.trim();
    const head = line.match(/^(?:def|class|over) (?:\w+ )?"(\w+)"/);
    if (head){ pending = {name: head[1], type: line.match(/^\w+ (\w+) "/)?.[1] || null, kind: null, apis: [], ref: null, props: {}}; continue; }
    if (pending){
      const apis = line.match(/^prepend apiSchemas = \[(.*)\]$/);
      if (apis) pending.apis = [...apis[1].matchAll(/"(\w+)"/g)].map(m => m[1]);
      const ref = line.match(/^prepend references = <(.+)>$/);
      if (ref) pending.ref = ref[1];
      const kind = line.match(/^kind = "(\w+)"$/);
      if (kind) pending.kind = kind[1];
      if (line === '{'){
        pending.path = [...stack.map(p => p.name), pending.name].map(n => '/' + n).join('');
        pending.parent = stack[stack.length - 1] || null;
        prims.push(pending); stack.push(pending); pending = null;
      }
      continue;
    }
    if (line === '}'){ stack.pop(); continue; }
    const cur = stack[stack.length - 1];
    const prop = cur && line.match(/^(custom )?(?:uniform )?(\w+(?:\[\])?) (dchall:\w+)/);
    if (prop) cur.props[prop[3]] = {type: prop[2], custom: !!prop[1]};
  }
  const byPath = Object.fromEntries(prims.map(p => [p.path, p]));
  prims.forEach(p => { p.allApis = [...p.apis, ...(p.ref && byPath[p.ref] ? byPath[p.ref].apis : [])]; });
  return prims;
}

describe('buildUsda', () => {
  it('重新生成的样例与 samples/datahall.usda 逐字节一致', () => {
    const {list, utility} = parseSampleLayout(SAMPLE);
    expect(list.length).toBe(17);
    expect(buildUsda(list, CAT, utility, GRID)).toBe(SAMPLE);
  });

  it('关系目标都指向存在的设备 prim', () => {
    const {list, utility} = parseSampleLayout(SAMPLE);
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
    expect(out).toContain('def Scope "Equipment" (\n        kind = "group"\n    )\n    {\n    }');
  });

  it('忽略目录里不存在的设备类型', () => {
    const out = buildUsda([{type: 'nope', x: 0, z: 0}], CAT, 2, GRID);
    expect(out).not.toContain('nope');
  });
});

describe('导出与 schema 一致', () => {
  const schema = parseSchema(GENERATED_SCHEMA);
  // 目录里每种设备各放一台，覆盖所有原型
  const everyType = CATALOG.map((t, i) => ({type: t.id, x: i, z: 0}));
  const prims = parseLayer(buildUsda(everyType, CAT, 5, GRID));

  it('schema 解析出三个 API', () => {
    expect(Object.keys(schema).sort()).toEqual(['DataHallAPI', 'DataHallEquipmentAPI', 'LiquidCooledAPI']);
    expect(schema.DataHallEquipmentAPI['dchall:powerKw']).toBe('double');
    expect(schema.LiquidCooledAPI['dchall:coolantSource']).toBe('rel');
  });

  it('每个 dchall: 属性都由应用的 schema 定义，类型一致，且不是 custom', () => {
    const checked = prims.filter(p => Object.keys(p.props).length);
    expect(checked.length).toBe(1 + CATALOG.length * 2);
    for (const p of checked){
      const defined = Object.assign({}, ...p.allApis.map(a => schema[a] || {}));
      for (const [name, {type, custom}] of Object.entries(p.props)){
        expect(defined[name], `${p.path} ${name}`).toBe(type);
        expect(custom, `${p.path} ${name}`).toBe(false);
      }
    }
  });

  it('LiquidCooledAPI 只应用在液冷设备上', () => {
    const liquid = prims.filter(p => p.path.startsWith('/DataHall/Catalog/') && p.apis.includes('LiquidCooledAPI')).map(p => p.name);
    expect(liquid.sort()).toEqual(CATALOG.filter(t => t.liq > 0).map(t => t.id).sort());
  });
});

describe('SimReady 约定（docs/simready-audit.md）', () => {
  const everyType = CATALOG.map((t, i) => ({type: t.id, x: i, z: 0}));
  const prims = parseLayer(buildUsda(everyType, CAT, 5, GRID));
  const out = buildUsda(everyType, CAT, 5, GRID);

  it('每个几何都绑定材质，目标是 UsdPreviewSurface 材质，且在同一原型或 /DataHall/Looks 内', () => {
    const byPath = Object.fromEntries(prims.map(p => [p.path, p]));
    const gprims = prims.filter(p => ['Cube', 'Mesh'].includes(p.type));
    expect(gprims.length).toBe(1 + CATALOG.length * 2);
    for (const p of gprims){
      const block = out.slice(out.indexOf(`"${p.name}"`, out.indexOf(`"${p.parent.name}"`)));
      const target = block.match(/rel material:binding = <([^>]+)>/)?.[1];
      expect(target, p.path).toBeDefined();
      expect(byPath[target]?.type, `${p.path} -> ${target}`).toBe('Material');
      const scope = p.path.startsWith('/DataHall/Catalog/') ? p.path.split('/').slice(0, 4).join('/') + '/Looks/' : '/DataHall/Looks/';
      expect(target.startsWith(scope), `${p.path} -> ${target}`).toBe(true);
      expect(out).toContain(`token outputs:surface.connect = <${target}/PreviewSurface.outputs:surface>`);
    }
  });

  it('模型层级连续：model 的祖先都是 group 或 assembly', () => {
    const models = prims.filter(p => ['component', 'group', 'assembly'].includes(p.kind));
    expect(models.filter(p => p.kind === 'component').length).toBe(CATALOG.length);
    for (const p of models){
      for (let a = p.parent; a; a = a.parent){
        expect(['group', 'assembly'], `${p.path} 的祖先 ${a.path}`).toContain(a.kind);
      }
    }
  });
});
