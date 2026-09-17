import {describe, expect, it} from 'vitest';
import {compute} from '../src/sim.js';
import {CAT} from '../src/catalog.js';
import {supplyLoads, supplyIssues} from '../src/supply.js';
import {canFail, blockingReasons, singlePointsOfFailure} from '../src/redundancy.js';
import {PRESETS} from '../src/layout.js';

const at = (type, x, z) => ({type, x, z});
const toList = p => p.list.map(([type, x, z]) => ({type, x, z}));
const where = r => r.item ? `${r.kind}@${r.item.x},${r.item.z}` : r.kind;

it('canFail：只有设施', () => {
  expect(['cdu', 'rpp', 'crah', 'ib'].every(id => canFail(CAT[id]))).toBe(true);
  expect(['gb200', 'vr200', 'kyber', 'dgx', 'stor'].some(id => canFail(CAT[id]))).toBe(false);
});

describe('blockingReasons', () => {
  it('和界面的“不能通电”条件一致', () => {
    const cases = [
      ...Object.values(PRESETS).map(p => [toList(p), p.u]),
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

  it('总量够但单台超载时给出超载设备', () => {
    const list = [...[0, 1, 2, 3, 4].map(x => at('vr200', x, 3)), at('cdu', 0, 5), at('cdu', 15, 5), at('rpp', 2, 5), at('rpp', 3, 5), at('ib', 4, 5), at('ib', 6, 5), at('crah', 5, 5)];
    expect(blockingReasons(list, CAT, 5).map(where)).toEqual(['overload@0,5']);
  });
});

describe('singlePointsOfFailure', () => {
  it('布局本身不满足时返回 null', () => {
    expect(singlePointsOfFailure([at('vr200', 0, 0)], CAT, 2)).toBe(null);
  });

  it('GB200 预设：每台 CDU、RPP、IB、空调都是单点', () => {
    const p = PRESETS.gb200;
    const spof = singlePointsOfFailure(toList(p), CAT, p.u);
    expect(spof.map(r => `${r.item.type}@${r.item.x}`)).toEqual(['cdu@4', 'cdu@5', 'ib@6', 'ib@7', 'rpp@8', 'rpp@9', 'crah@10', 'crah@11']);
    // CDU 故障后总液冷不够；IB 故障后端口不够
    expect(spof[0].reasons.map(where)).toEqual(['liquid']);
    expect(spof[2].reasons.map(where)).toEqual(['network']);
  });

  it('N+1 预设没有单点', () => {
    const p = PRESETS.gb200n1;
    expect(singlePointsOfFailure(toList(p), CAT, p.u)).toEqual([]);
  });

  it('单台故障后负载转到别处导致超载', () => {
    // 6 柜 Vera Rubin，3 台 CDU。第 4 列的 CDU 故障后，它带的机柜转到第 9 列的 CDU，总冷量仍够但那台超载
    const list = [...[2, 3, 4, 5, 6, 7].map(x => at('vr200', x, 3)),
      at('cdu', 3, 5), at('cdu', 8, 5), at('cdu', 12, 5), at('rpp', 2, 5), at('rpp', 4, 5), at('rpp', 9, 5),
      at('ib', 1, 5), at('ib', 15, 5), at('crah', 5, 5), at('crah', 14, 5)];
    expect(blockingReasons(list, CAT, 5)).toEqual([]);
    const cdu3 = singlePointsOfFailure(list, CAT, 5).find(r => r.item.type === 'cdu' && r.item.x === 3);
    expect(cdu3.reasons.map(where)).toEqual(['overload@8,5']);
  });
});
