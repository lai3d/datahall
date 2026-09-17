import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.js';
import {CAT, CATALOG} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {parseSampleLayout, readSample} from '../scripts/sample.js';

const SAMPLE = readSample();
const META = {date: '2026-09-17'};
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
    const {list, utility, date} = parseSampleLayout(SAMPLE);
    expect(list.length).toBe(17);
    expect(buildUsda(list, CAT, utility, GRID, {date})).toBe(SAMPLE);
  });

  it('关系目标都指向存在的设备 prim', () => {
    const {list, utility} = parseSampleLayout(SAMPLE);
    const out = buildUsda(list, CAT, utility, GRID, META);
    const defined = new Set([...out.matchAll(/def Xform "(R\d\d_C\d\d)"/g)].map(m => m[1]));
    const targets = [...out.matchAll(/rel dchall:\w+ = <\/DataHall\/Equipment\/(\w+)>/g)].map(m => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach(t => expect(defined).toContain(t));
  });

  it('空机房也能导出合法的层头和空 Scope', () => {
    const out = buildUsda([], CAT, 2, GRID, META);
    expect(out).toMatch(/^#usda 1\.0\n/);
    expect(out).toContain('defaultPrim = "DataHall"');
    expect(out).toContain('def Scope "Equipment" (\n        kind = "group"\n    )\n    {\n    }');
  });

  it('忽略目录里不存在的设备类型', () => {
    const out = buildUsda([{type: 'nope', x: 0, z: 0}], CAT, 2, GRID, META);
    expect(out).not.toContain('nope');
  });
});

describe('导出与 schema 一致', () => {
  const schema = parseSchema(GENERATED_SCHEMA);
  // 目录里每种设备各放一台，覆盖所有原型
  const everyType = CATALOG.map((t, i) => ({type: t.id, x: i, z: 0}));
  const prims = parseLayer(buildUsda(everyType, CAT, 5, GRID, META));

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
  const out = buildUsda(everyType, CAT, 5, GRID, META);
  const prims = parseLayer(out);

  // SR.001 的官方校验器（2026.06.0）不会真正报错，这里按规范原文检查
  it('立方体网格每个面按右手定则朝外，且与写入的法线一致', () => {
    const arr = name => JSON.parse('[' + out.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))[1].replace(/\(/g, '[').replace(/\)/g, ']') + ']');
    const points = arr('point3f\\[\\] points'), idx = arr('int\\[\\] faceVertexIndices'), normals = arr('normal3f\\[\\] normals');
    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a.reduce((t, v, i) => t + v * b[i], 0);
    expect(idx.length).toBe(24);
    for (let face = 0; face < 6; face++){
      const [p0, p1, p2, p3] = idx.slice(face * 4, face * 4 + 4).map(i => points[i]);
      const n = cross(sub(p1, p0), sub(p2, p0));
      const centroid = [p0, p1, p2, p3].reduce((c, p) => c.map((v, i) => v + p[i] / 4), [0, 0, 0]);
      expect(dot(n, centroid), `face ${face} faces outward`).toBeGreaterThan(0);
      normals.slice(face * 4, face * 4 + 4).forEach(nn => expect(dot(nn, n) / Math.hypot(...n), `face ${face} normal`).toBeCloseTo(1));
    }
  });

  it('customLayerData 带 SR.001 要求的元数据', () => {
    const head = out.slice(0, out.indexOf('\n)\n'));
    ['asset_name', 'asset_type', 'source_file'].forEach(k => expect(head).toMatch(new RegExp(`string ${k} = "[^"]+"`)));
    expect(head).toContain('string usd_date_generated = "2026-09-17"');
    expect(head).toContain('dictionary SimReady_Metadata = {');
  });

  it('缺少或格式错误的生成日期直接报错', () => {
    expect(() => buildUsda([], CAT, 2, GRID)).toThrow(/meta.date/);
    expect(() => buildUsda([], CAT, 2, GRID, {date: '2026/09/17'})).toThrow(/meta.date/);
  });

  it('每个几何都绑定材质，目标是 UsdPreviewSurface 材质，且在同一原型或 /DataHall/Looks 内', () => {
    const byPath = Object.fromEntries(prims.map(p => [p.path, p]));
    const gprims = prims.filter(p => p.type === 'Mesh');
    expect(prims.filter(p => ['Cube', 'Sphere', 'Cylinder', 'Cone', 'Capsule'].includes(p.type))).toEqual([]);
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
