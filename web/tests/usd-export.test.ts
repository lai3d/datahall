import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {parseSampleLayout, readSample} from '../scripts/sample.ts';
import {CATALOG_VERSION} from '../src/catalog.ts';
import {MODEL_VERSION} from '../src/sim.ts';

const SAMPLE = readSample();
const META = {date: '2026-09-17'};
const GENERATED_SCHEMA = readFileSync(new URL('../../schema/generatedSchema.usda', import.meta.url), 'utf8');

// generatedSchema.usda → {APIName: {propName: 'double' | 'rel' | ...}}
function parseSchema(src: string): Record<string, Record<string, string>>{
  const out: Record<string, Record<string, string>> = {};
  let cur: Record<string, string> | null = null;
  for (const line of src.split('\n')){
    const cls = line.match(/^class "(\w+)"/);
    if (cls){ cur = out[cls[1]] = {}; continue; }
    const prop = cur && line.match(/^    (?:uniform )?(\w+(?:\[\])?) (dchall:\w+)/);
    if (cur && prop) cur[prop[2]] = prop[1];
  }
  return out;
}

// Exported layer → each prim's path, applied schemas (including those on referenced prototypes) and written dchall: attributes
interface LayerPrim {
  name: string; type: string | null; kind: string | null; apis: string[]; ref: string | null;
  props: Record<string, {type: string; custom: boolean}>; path?: string; parent?: LayerPrim | null; allApis?: string[];
}
function parseLayer(src: string){
  const prims: Required<LayerPrim>[] = [], stack: LayerPrim[] = [];
  let pending: LayerPrim | null = null;
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
        prims.push(pending as Required<LayerPrim>); stack.push(pending); pending = null;
      }
      continue;
    }
    if (line === '}'){ stack.pop(); continue; }
    const cur = stack[stack.length - 1];
    const prop = cur && line.match(/^(custom )?(?:uniform )?(\w+(?:\[\])?) (dchall:\w+)/);
    if (prop) cur.props[prop[3]] = {type: prop[2], custom: !!prop[1]};
  }
  const byPath: Record<string, LayerPrim> = Object.fromEntries(prims.map(p => [p.path, p]));
  prims.forEach(p => { p.allApis = [...p.apis, ...(p.ref && byPath[p.ref] ? byPath[p.ref].apis : [])]; });
  return prims;
}

describe('buildUsda', () => {
  it('regenerated sample is byte-identical to samples/datahall.usda', () => {
    const {list, utility, date} = parseSampleLayout(SAMPLE);
    expect(list.length).toBe(17);
    expect(buildUsda(list, CAT, utility, GRID, {date: date!})).toBe(SAMPLE);
  });

  it('relationship targets all point to existing equipment prims', () => {
    const {list, utility} = parseSampleLayout(SAMPLE);
    const out = buildUsda(list, CAT, utility, GRID, META);
    const defined = new Set([...out.matchAll(/def Xform "(R\d\d_C\d\d)"/g)].map(m => m[1]));
    const targets = [...out.matchAll(/rel dchall:\w+ = <\/DataHall\/Equipment\/(\w+)>/g)].map(m => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach(t => expect(defined).toContain(t));
  });

  it('empty hall still exports a valid layer header and an empty Scope', () => {
    const out = buildUsda([], CAT, 2, GRID, META);
    expect(out).toMatch(/^#usda 1\.0\n/);
    expect(out).toContain('defaultPrim = "DataHall"');
    expect(out).toContain('def Scope "Equipment" (\n        kind = "group"\n    )\n    {\n    }');
  });

  it('ignores device types not in the catalog', () => {
    const out = buildUsda([{type: 'nope', x: 0, z: 0}], CAT, 2, GRID, META);
    expect(out).not.toContain('nope');
  });
});

describe('export matches the schema', () => {
  const schema = parseSchema(GENERATED_SCHEMA);
  // One of each catalog device, covering every prototype
  const everyType = CATALOG.map((t, i) => ({type: t.id, x: i, z: 0}));
  const prims = parseLayer(buildUsda(everyType, CAT, 5, GRID, META));

  it('schema parses into three APIs', () => {
    expect(Object.keys(schema).sort()).toEqual(['DataHallAPI', 'DataHallEquipmentAPI', 'LiquidCooledAPI']);
    expect(schema.DataHallEquipmentAPI['dchall:powerKw']).toBe('double');
    expect(schema.LiquidCooledAPI['dchall:coolantSource']).toBe('rel');
  });

  it('every dchall: attribute is defined by an applied schema with a matching type and is not custom', () => {
    const checked = prims.filter(p => Object.keys(p.props).length);
    expect(checked.length).toBe(1 + CATALOG.length * 2);
    for (const p of checked){
      const defined: Record<string, string> = Object.assign({}, ...p.allApis.map(a => schema[a] || {}));
      for (const [name, {type, custom}] of Object.entries(p.props)){
        expect(defined[name], `${p.path} ${name}`).toBe(type);
        expect(custom, `${p.path} ${name}`).toBe(false);
      }
    }
  });

  it('LiquidCooledAPI is applied only to liquid-cooled devices', () => {
    const liquid = prims.filter(p => p.path.startsWith('/DataHall/Catalog/') && p.apis.includes('LiquidCooledAPI')).map(p => p.name);
    expect(liquid.sort()).toEqual(CATALOG.filter(t => (t.liq || 0) > 0).map(t => t.id).sort());
  });
});

describe('SimReady conventions (docs/simready-audit.md)', () => {
  const everyType = CATALOG.map((t, i) => ({type: t.id, x: i, z: 0}));
  const out = buildUsda(everyType, CAT, 5, GRID, META);
  const prims = parseLayer(out);

  // The official SR.001 validator (2026.06.0) never actually fails, so check against the spec text here
  it('each cube mesh face points outward by the right-hand rule and matches the written normals', () => {
    type V3 = number[];
    const arr = (name: string) => JSON.parse('[' + out.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))![1].replace(/\(/g, '[').replace(/\)/g, ']') + ']');
    const points = arr('point3f\\[\\] points'), idx = arr('int\\[\\] faceVertexIndices'), normals = arr('normal3f\\[\\] normals');
    const sub = (a: V3, b: V3) => a.map((v, i) => v - b[i]);
    const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a: V3, b: V3) => a.reduce((t, v, i) => t + v * b[i], 0);
    expect(idx.length).toBe(24);
    for (let face = 0; face < 6; face++){
      const [p0, p1, p2, p3]: V3[] = idx.slice(face * 4, face * 4 + 4).map((i: number) => points[i]);
      const n = cross(sub(p1, p0), sub(p2, p0));
      const centroid = [p0, p1, p2, p3].reduce((c, p) => c.map((v, i) => v + p[i] / 4), [0, 0, 0]);
      expect(dot(n, centroid), `face ${face} faces outward`).toBeGreaterThan(0);
      normals.slice(face * 4, face * 4 + 4).forEach((nn: V3) => expect(dot(nn, n) / Math.hypot(...n), `face ${face} normal`).toBeCloseTo(1));
    }
  });

  it('customLayerData carries the metadata SR.001 requires', () => {
    const head = out.slice(0, out.indexOf('\n)\n'));
    ['asset_name', 'asset_type', 'source_file'].forEach(k => expect(head).toMatch(new RegExp(`string ${k} = "[^"]+"`)));
    expect(head).toContain('string usd_date_generated = "2026-09-17"');
    expect(head).toContain('dictionary SimReady_Metadata = {');
  });

  it('throws on a missing or malformed generation date', () => {
    // @ts-expect-error missing meta must also throw at runtime
    expect(() => buildUsda([], CAT, 2, GRID)).toThrow(/meta.date/);
    expect(() => buildUsda([], CAT, 2, GRID, {date: '2026/09/17'})).toThrow(/meta.date/);
  });

  it('every geometry binds a UsdPreviewSurface material within the same prototype or /DataHall/Looks', () => {
    const byPath: Record<string, LayerPrim> = Object.fromEntries(prims.map(p => [p.path, p]));
    const gprims = prims.filter(p => p.type === 'Mesh');
    expect(prims.filter(p => ['Cube', 'Sphere', 'Cylinder', 'Cone', 'Capsule'].includes(p.type || ''))).toEqual([]);
    expect(gprims.length).toBe(1 + CATALOG.length * 2);
    for (const p of gprims){
      const block = out.slice(out.indexOf(`"${p.name}"`, out.indexOf(`"${p.parent!.name}"`)));
      const target = block.match(/rel material:binding = <([^>]+)>/)?.[1] ?? '';
      expect(target, p.path).toBeDefined();
      expect(byPath[target]?.type, `${p.path} -> ${target}`).toBe('Material');
      const scope = p.path.startsWith('/DataHall/Catalog/') ? p.path.split('/').slice(0, 4).join('/') + '/Looks/' : '/DataHall/Looks/';
      expect(target.startsWith(scope), `${p.path} -> ${target}`).toBe(true);
      expect(out).toContain(`token outputs:surface.connect = <${target}/PreviewSurface.outputs:surface>`);
    }
  });

  it('model hierarchy is continuous: ancestors of a model are group or assembly', () => {
    const models = prims.filter(p => ['component', 'group', 'assembly'].includes(p.kind || ''));
    expect(models.filter(p => p.kind === 'component').length).toBe(CATALOG.length);
    for (const p of models){
      for (let a: LayerPrim | null | undefined = p.parent; a; a = a.parent){
        expect(['group', 'assembly'], `ancestor ${a.path} of ${p.path}`).toContain(a.kind);
      }
    }
  });
});

describe('provenance', () => {
  it('writes the catalog and model versions into customLayerData', () => {
    const usda = buildUsda([{type: 'gb200', x: 0, z: 0}], CAT, 2, GRID, {date: '2026-09-18'});
    expect(usda).toContain(`string "dchall:catalogVersion" = "${CATALOG_VERSION}"`);
    expect(usda).toContain(`string "dchall:modelVersion" = "${MODEL_VERSION}"`);
  });
});
