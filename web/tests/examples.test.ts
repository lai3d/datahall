import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.ts';
import {GRID, keyOf} from '../src/grid.ts';
import {toEntry, toItems} from '../src/edit.ts';
import {blockingReasons} from '../src/redundancy.ts';
import {growthPlan} from '../src/growth.ts';
import {planRepair} from '../src/repair.ts';
import {decodeLayout, encodeLayout} from '../src/share-link.ts';
import {check, examples} from '../src/examples.ts';
import type {Example} from '../src/examples.ts';
import type {Entry, Item} from '../src/types.ts';
import {readFileSync} from 'node:fs';

const ALL = examples(CAT, GRID);
const cases = ALL.map(ex => [ex.id, ex] as [string, Example]);
const byId = (id: string) => ALL.find(ex => ex.id === id)!;
const items = (ex: Example): Item[] => toItems(ex.layout.list);
// Type, cell and props in one comparable form, so two layouts match regardless of entry order or how the props were written
const devices = (list: Entry[]) => toItems(list).map(i => JSON.stringify(toEntry(i))).sort();

describe('every example hall', () => {
  it('there is at least one', () => {
    expect(ALL.length).toBeGreaterThan(0);
  });

  it.each(cases)('%s: sits on the grid, one known device per cell', (_, ex) => {
    const list = items(ex);
    expect(list.length).toBeGreaterThan(0);
    const keys = list.map(i => keyOf(i.x, i.z));
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of list){
      expect(CAT[i.type], `${i.type} is not in the catalog`).toBeTruthy();
      expect(Number.isInteger(i.x) && Number.isInteger(i.z)).toBe(true);
      expect(i.x >= 0 && i.x < GRID.GW && i.z >= 0 && i.z < GRID.GD, `${i.type} at ${i.x},${i.z} is off the grid`).toBe(true);
    }
    expect(ex.layout.u).toBeGreaterThan(0);
  });

  // The point of this file: a catalog change that breaks the story an example tells must fail here
  it.each(cases)('%s: still holds up every claim it makes', (_, ex) => {
    const actual = check(ex, CAT);
    expect(actual.powers).toBe(ex.claims.powers);
    if (ex.claims.n1 !== undefined) expect(actual.n1).toBe(ex.claims.n1);
    if (ex.claims.phases !== undefined) expect(actual.phases).toBe(ex.claims.phases);
    if (ex.claims.gpus !== undefined) expect(actual.gpus).toBe(ex.claims.gpus);
  });

  it.each(cases)('%s: survives a share link round trip', (_, ex) => {
    const back = decodeLayout('#' + encodeLayout(ex.layout), CAT, GRID);
    expect(back).not.toBeNull();
    expect(back!.warnings).toEqual([]);
    expect(back!.u).toBe(ex.layout.u);
    expect(devices(back!.list)).toEqual(devices(ex.layout.list));
  });
});

describe('the gallery itself', () => {
  it('gives every example its own id and title', () => {
    expect(new Set(ALL.map(ex => ex.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map(ex => ex.title)).size).toBe(ALL.length);
  });

  it('uses lowercase kebab-case ids, since they end up in file names and links', () => {
    for (const ex of ALL) expect(ex.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('the growth example', () => {
  it('has every phase passing, which is what its blurb promises', () => {
    const ex = byId('growth');
    for (const phase of growthPlan(items(ex), CAT, ex.layout.u)) expect(phase.reasons).toEqual([]);
  });
});

describe('the broken example', () => {
  it('really cannot power on, and the panel offers a repair that works', () => {
    const ex = byId('broken');
    const list = items(ex);
    expect(blockingReasons(list, CAT, ex.layout.u).length).toBeGreaterThan(0);
    const options = planRepair(list, CAT, ex.layout.u, new Set(list.map(i => keyOf(i.x, i.z))), GRID);
    expect(options?.some(o => o.passes)).toBe(true);
  });
});

describe('docs/examples.md', () => {
  it('is what the generator writes today (run npm run examples after changing an example)', async () => {
    const {DOC_PATH, buildDoc} = await import('../scripts/examples-doc.ts');
    expect(readFileSync(DOC_PATH, 'utf8')).toBe(buildDoc());
  });
});
