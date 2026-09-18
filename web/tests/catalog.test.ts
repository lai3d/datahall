// The catalog is the single source of truth, and every figure in it must say where it comes from
import {describe, expect, it} from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import {readFileSync} from 'node:fs';
import {CATALOG, CATALOG_VERSION} from '../src/catalog.ts';
import type {SourcedField} from '../src/types.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

describe('catalog', () => {
  it('data version is the newest checked date of its sources', () => {
    const cat = json('../../spec/catalog.json') as {version: string; items: {sources: {checked: string}[]}[]};
    const newest = cat.items.flatMap(t => t.sources.map(s => s.checked)).sort().at(-1);
    expect(cat.version).toBe(newest);
    expect(CATALOG_VERSION).toBe(cat.version);
  });

  it('matches spec/catalog.schema.json', () => {
    const validate = new Ajv2020({allErrors: true}).compile(json('../../spec/catalog.schema.json'));
    expect(validate(json('../../spec/catalog.json')), JSON.stringify(validate.errors, null, 1)).toBe(true);
  });

  // Figures the capacity model and the price estimate use; each one needs at least one source
  const FIELDS: SourcedField[] = ['kw', 'gpus', 'liq', 'liqCool', 'airCool', 'dist', 'ports', 'ovh', 'cap'];
  for (const t of CATALOG){
    it(`${t.id}: every figure is backed by a source`, () => {
      const backed = new Set(t.sources.flatMap(s => s.supports));
      for (const f of FIELDS) if (t[f] !== undefined) expect(backed.has(f), `${t.id}.${f}`).toBe(true);
      for (const s of t.sources) for (const f of s.supports) expect(t[f], `${t.id}: source "${s.title}" supports missing field ${f}`).not.toBeUndefined();
    });

    it(`${t.id}: simulation values fall inside the ranges the sources give`, () => {
      for (const [f, [lo, hi]] of Object.entries(t.ranges ?? {}) as [SourcedField, [number, number]][]){
        expect(lo, `${t.id}.${f} range`).toBeLessThanOrEqual(hi);
        expect(t[f], `${t.id}.${f}`).toBeGreaterThanOrEqual(lo);
        expect(t[f], `${t.id}.${f}`).toBeLessThanOrEqual(hi);
      }
    });
  }
});
