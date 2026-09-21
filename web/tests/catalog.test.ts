// The catalog is the single source of truth, and every figure in it must say where it comes from
import {describe, expect, it} from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import {readFileSync} from 'node:fs';
import {CABLES, CATALOG, CATALOG_VERSION} from '../src/catalog.ts';
import type {ItemField, RangeField} from '../src/types.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

describe('catalog', () => {
  it('data version is the newest checked date of its sources', () => {
    type Sourced = {sources: {checked: string}[]};
    const cat = json('../../spec/catalog.json') as {version: string; items: Sourced[]; cables: Sourced[]};
    const newest = [...cat.items, ...cat.cables].flatMap(t => t.sources.map(s => s.checked)).sort().at(-1);
    expect(cat.version).toBe(newest);
    expect(CATALOG_VERSION).toBe(cat.version);
  });

  it('matches spec/catalog.schema.json', () => {
    const validate = new Ajv2020({allErrors: true}).compile(json('../../spec/catalog.schema.json'));
    expect(validate(json('../../spec/catalog.json')), JSON.stringify(validate.errors, null, 1)).toBe(true);
  });

  // Figures the capacity model and the price estimate use; each one needs at least one source
  const FIELDS: ItemField[] = ['kw', 'gpus', 'liq', 'liqCool', 'airCool', 'dist', 'ports', 'ovh', 'cap', 'radix', 'portGbps', 'fabric', 'nics', 'rails', 'planes', 'nicGbps', 'parts'];
  for (const t of CATALOG){
    it(`${t.id}: every figure is backed by a source`, () => {
      const backed = new Set(t.sources.flatMap(s => s.supports));
      for (const f of FIELDS) if (t[f] !== undefined) expect(backed.has(f), `${t.id}.${f}`).toBe(true);
      for (const s of t.sources) for (const f of s.supports) expect(t[f as ItemField], `${t.id}: source "${s.title}" supports missing field ${f}`).not.toBeUndefined();
    });

    it(`${t.id}: simulation values fall inside the ranges the sources give`, () => {
      for (const [f, [lo, hi]] of Object.entries(t.ranges ?? {}) as [RangeField, [number, number]][]){
        expect(lo, `${t.id}.${f} range`).toBeLessThanOrEqual(hi);
        expect(t[f], `${t.id}.${f}`).toBeGreaterThanOrEqual(lo);
        expect(t[f], `${t.id}.${f}`).toBeLessThanOrEqual(hi);
      }
    });
  }

  // Back-end fabric: every GPU rack says whether its fabric is modeled; a modeled one needs its NIC figures and a switch at its speed
  it('GPU racks declare their back-end fabric', () => {
    const sw = CATALOG.filter(t => t.radix);
    expect(sw.length).toBe(1);
    for (const t of CATALOG.filter(t => t.gpus)){
      expect(t.fabric, t.id).toBeDefined();
      if (t.fabric !== 'x800') continue;
      expect(t.nics && t.rails && t.nicGbps, t.id).toBeTruthy();
      expect(t.nicGbps, t.id).toBe(sw[0]!.portGbps);
      expect((t.nics ?? 0) % (t.planes ?? 1), `${t.id} NICs split evenly over planes`).toBe(0);
      expect((t.rails ?? 0) % (t.planes ?? 1), `${t.id} rails split evenly over planes`).toBe(0);
      expect((t.nics ?? 0) % (t.rails ?? 1), `${t.id} NICs split evenly over rails`).toBe(0);
    }
    for (const t of CATALOG.filter(t => !t.gpus)) expect(t.fabric, t.id).toBeUndefined();
  });

  it('cable classes are sourced and ordered by reach', () => {
    for (const c of CABLES){
      expect(c.sources.some(s => s.supports.includes('maxM')), c.id).toBe(true);
      for (const s of c.sources) for (const f of s.supports) expect(f, `${c.id}: ${s.title}`).toBe('maxM');
    }
    for (const g of new Set(CABLES.map(c => c.gbps))){
      const reach = CABLES.filter(c => c.gbps === g).map(c => c.maxM);
      expect(reach).toEqual([...reach].sort((a, b) => a - b));
    }
  });

  // The parts add up to the rack's own figures, so the details panel and the 3D front cannot disagree with the capacity model
  it('rack parts add up to the GPU and port counts', () => {
    for (const t of CATALOG.filter(t => t.parts)){
      const gpus = t.parts!.reduce((n, p) => n + p.n * (p.gpus ?? 0), 0);
      if (t.gpus) expect(gpus, t.id).toBe(t.gpus);
      const ports = t.parts!.reduce((n, p) => n + p.n * (p.ports ?? 0), 0);
      if (ports) expect(ports, t.id).toBe(t.ports);
    }
  });
});
