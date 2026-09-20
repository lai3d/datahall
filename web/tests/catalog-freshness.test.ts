// The freshness check must not drift with the day it runs: every case here fixes "today" and feeds a hand-built catalog
import {describe, expect, it} from 'vitest';
import {freshness, CHECK_DAYS, SOURCE_MONTHS} from '../scripts/catalog-freshness.ts';
import {CATALOG} from '../src/catalog.ts';
import type {CatalogItem, Source} from '../src/types.ts';

const TODAY = new Date('2026-09-20T00:00:00Z');
const src = (s: Partial<Source>): Source => ({title: 'T', publisher: 'P', checked: '2026-09-20', type: 'official', supports: ['kw'], ...s});
const item = (id: string, sources: Source[]): CatalogItem => ({id, name: id.toUpperCase(), group: 'gpu', c: '--gpu', kw: 100, cap: 1, h: 2.3, note: '', sources});
// Days before today, as an ISO date
const ago = (n: number) => new Date(TODAY.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe('catalog freshness', () => {
  it('reports nothing when every device and source is fresh', () => {
    const f = freshness([item('a', [src({date: '2026-06-01'})]), item('b', [src({checked: ago(1)})])], TODAY);
    expect(f.stale).toEqual([]);
    expect(f.aging).toEqual([]);
  });

  it('is stale one day past the check threshold, not on it', () => {
    expect(freshness([item('a', [src({checked: ago(CHECK_DAYS)})])], TODAY).stale).toEqual([]);
    expect(freshness([item('a', [src({checked: ago(CHECK_DAYS + 1)})])], TODAY).stale)
      .toEqual([{id: 'a', name: 'A', checked: ago(CHECK_DAYS + 1), days: CHECK_DAYS + 1}]);
  });

  it('measures a device by its newest checked date', () => {
    const t = item('a', [src({checked: ago(400)}), src({checked: ago(10)})]);
    expect(freshness([t], TODAY).stale).toEqual([]);
  });

  it('lists stale devices oldest first', () => {
    const cat = [item('mid', [src({checked: ago(200)})]), item('old', [src({checked: ago(500)})]), item('new', [src({checked: ago(91)})])];
    expect(freshness(cat, TODAY).stale.map(d => d.id)).toEqual(['old', 'mid', 'new']);
  });

  it('is aging one day past the source threshold, not on it', () => {
    // 18 months before 2026-09-20 is 2025-03-20
    expect(freshness([item('a', [src({date: '2025-03-20'})])], TODAY).aging).toEqual([]);
    expect(freshness([item('a', [src({date: '2025-03-19'})])], TODAY).aging)
      .toEqual([{id: 'a', title: 'T', publisher: 'P', date: '2025-03-19', months: SOURCE_MONTHS, supports: ['kw']}]);
  });

  it('reads a month-only source date as the first of that month', () => {
    expect(freshness([item('a', [src({date: '2025-04'})])], TODAY).aging).toEqual([]);
    expect(freshness([item('a', [src({date: '2025-03'})])], TODAY).aging.map(s => s.months)).toEqual([18]);
  });

  it('ignores old sources that back no current figure', () => {
    const undated = item('a', [src({date: undefined})]);
    const context = item('b', [src({date: '2020-01-01', supports: []})]);
    const gone = item('c', [src({date: '2020-01-01', supports: ['ports']})]);   // the item has no ports
    expect(freshness([undated, context, gone], TODAY).aging).toEqual([]);
  });

  it('lists aging sources oldest first', () => {
    const cat = [item('a', [src({title: 'younger', date: '2024-01-01'})]), item('b', [src({title: 'older', date: '2019-05-06'})])];
    expect(freshness(cat, TODAY).aging.map(s => s.title)).toEqual(['older', 'younger']);
  });

  it('counts distinct source hosts, most evidence first, without failing on anything', () => {
    const cat = [
      item('a', [src({url: 'https://www.nvidia.com/a'}), src({url: 'https://nvidia.com/b'}), src({url: 'not a url'})]),
      item('b', [src({url: 'https://tomshardware.com/c'}), src({url: undefined})]),
    ];
    expect(freshness(cat, TODAY).hosts).toEqual([{host: 'nvidia.com', count: 2}, {host: 'tomshardware.com', count: 1}]);
  });

  it('finds nothing stale in the current catalog on its own check date', () => {
    const checked = CATALOG.flatMap(t => t.sources.map(s => s.checked)).sort().at(-1) as string;
    expect(freshness(CATALOG, new Date(`${checked}T00:00:00Z`)).stale).toEqual([]);
  });
});
