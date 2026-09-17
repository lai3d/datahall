import {describe, expect, it} from 'vitest';
import {compute} from '../src/sim.ts';
import {CAT} from '../src/catalog.ts';
import {supplyLoads, supplyIssues} from '../src/supply.ts';
import {canFail, blockingReasons, singlePointsOfFailure} from '../src/redundancy.ts';
import {PRESETS} from '../src/layout.ts';
import {toItems} from '../src/edit.ts';
import type {Reason} from '../src/redundancy.ts';
import type {Item, Layout} from '../src/types.ts';

const at = (type: string, x: number, z: number): Item => ({type, x, z});
const toList = (p: Layout) => toItems(p.list);
const where = (r: Reason) => 'item' in r ? `${r.kind}@${r.item.x},${r.item.z}` : r.kind;

it('canFail: facilities only', () => {
  expect(['cdu', 'rpp', 'crah', 'ib'].every(id => canFail(CAT[id]))).toBe(true);
  expect(['gb200', 'vr200', 'kyber', 'dgx', 'stor'].some(id => canFail(CAT[id]))).toBe(false);
});

describe('blockingReasons', () => {
  it('matches the UI "cannot power on" condition', () => {
    const cases: [Item[], number][] = [
      ...Object.values(PRESETS).map((p): [Item[], number] => [toList(p), p.u]),
      [[at('vr200', 0, 0)], 2],
      [[0, 1, 2, 3].map(x => at('kyber', x, 0)), 2],
      [[...[0, 1, 2, 3, 4].map(x => at('vr200', x, 3)), at('cdu', 0, 5), at('cdu', 15, 5), at('rpp', 2, 5), at('rpp', 3, 5), at('ib', 4, 5), at('crah', 5, 5)], 5],
    ];
    for (const [list, u] of cases){
      const s = compute(list, CAT, u);
      const blocking = s.blocking || supplyIssues(supplyLoads(list, CAT), s).some(i => i.lvl === 'bad');
      expect(blockingReasons(list, CAT, u).length > 0).toBe(blocking);
    }
  });

  it('reports the overloaded device when totals suffice but one unit is overloaded', () => {
    const list = [...[0, 1, 2, 3, 4].map(x => at('vr200', x, 3)), at('cdu', 0, 5), at('cdu', 15, 5), at('rpp', 2, 5), at('rpp', 3, 5), at('ib', 4, 5), at('ib', 6, 5), at('crah', 5, 5)];
    expect(blockingReasons(list, CAT, 5).map(where)).toEqual(['overload@0,5']);
  });
});

describe('singlePointsOfFailure', () => {
  it('returns null when the layout itself fails', () => {
    expect(singlePointsOfFailure([at('vr200', 0, 0)], CAT, 2)).toBe(null);
  });

  it('GB200 preset: every CDU, RPP, IB and CRAH is a single point of failure', () => {
    const p = PRESETS.gb200;
    const spof = singlePointsOfFailure(toList(p), CAT, p.u)!;
    expect(spof.map(r => `${r.item.type}@${r.item.x}`)).toEqual(['cdu@4', 'cdu@5', 'ib@6', 'ib@7', 'rpp@8', 'rpp@9', 'crah@10', 'crah@11']);
    // After a CDU failure total liquid cooling is short; after an IB failure ports are short
    expect(spof[0].reasons.map(where)).toEqual(['liquid']);
    expect(spof[2].reasons.map(where)).toEqual(['network']);
  });

  it('N+1 preset has no single point of failure', () => {
    const p = PRESETS.gb200n1;
    expect(singlePointsOfFailure(toList(p), CAT, p.u)).toEqual([]);
  });

  it('a single failure shifts load elsewhere and causes an overload', () => {
    // 6 Vera Rubin racks, 3 CDUs. When the CDU in column 4 fails, its racks move to the CDU in column 9; total cooling still suffices but that unit is overloaded
    const list = [...[2, 3, 4, 5, 6, 7].map(x => at('vr200', x, 3)),
      at('cdu', 3, 5), at('cdu', 8, 5), at('cdu', 12, 5), at('rpp', 2, 5), at('rpp', 4, 5), at('rpp', 9, 5),
      at('ib', 1, 5), at('ib', 15, 5), at('crah', 5, 5), at('crah', 14, 5)];
    expect(blockingReasons(list, CAT, 5)).toEqual([]);
    const cdu3 = singlePointsOfFailure(list, CAT, 5)!.find(r => r.item.type === 'cdu' && r.item.x === 3)!;
    expect(cdu3.reasons.map(where)).toEqual(['overload@8,5']);
  });
});
