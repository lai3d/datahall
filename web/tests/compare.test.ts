import {describe, expect, it} from 'vitest';
import {CAT} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {compute} from '../src/sim.ts';
import {compareRacks, largestHall, supportFor} from '../src/compare.ts';
import {scaleRefs} from '../src/scale.ts';
import type {Item} from '../src/types.ts';

const SUPPORT = ['cdu', 'rpp', 'crah', 'ib'] as const;
const hall = (type: string, racks: number, support: Record<(typeof SUPPORT)[number], number>): Item[] =>
  [...Array(racks).fill(type), ...SUPPORT.flatMap(k => Array(support[k]).fill(k))].map((t, i) => ({type: t, x: i % GRID.GW, z: Math.floor(i / GRID.GW)}));
const cells = GRID.GW * GRID.GD;

describe('largest hall per rack type', () => {
  const gpuTypes = Object.values(CAT).filter(t => t.gpus).map(t => t.id);

  it('covers every GPU rack type in catalog order', () => {
    expect(compareRacks(CAT, 2, GRID).map(h => h.type)).toEqual(gpuTypes);
  });

  for (const u of [2, 5, 10]) for (const type of gpuTypes){
    it(`${type} at ${u} MW passes, and one more rack does not fit`, () => {
      const h = largestHall(type, CAT, u, GRID);
      expect(h.racks).toBeGreaterThan(0);
      const s = compute(hall(type, h.racks, h.support), CAT, u);
      expect(s.blocking).toBe(false);
      expect([s.gpus, s.pue, s.capex]).toEqual([h.gpus, h.pue, h.capex]);
      const more = supportFor(type, h.racks + 1, CAT), moreCells = h.racks + 1 + SUPPORT.reduce((n, k) => n + more[k], 0);
      if (h.limit === 'floor') expect(moreCells).toBeGreaterThan(cells);
      else expect(compute(hall(type, h.racks + 1, more), CAT, u).blocking).toBe(true);
    });

    it(`${type} at ${u} MW uses no more support equipment than it needs`, () => {
      const h = largestHall(type, CAT, u, GRID);
      for (const k of SUPPORT) if (h.support[k] > 0)
        expect(compute(hall(type, h.racks, {...h.support, [k]: h.support[k] - 1}), CAT, u).blocking, k).toBe(true);
    });
  }

  it('reports zero racks when not even one fits', () => {
    expect(largestHall('kyber', CAT, 0.2, GRID)).toMatchObject({racks: 0, gpus: 0});
  });

  it('stops at the floor when power is not the limit', () => {
    expect(largestHall('dgx', CAT, 10, GRID).limit).toBe('floor');
  });
});

describe('scale references', () => {
  it('rounds to two significant figures', () => {
    expect(scaleRefs(1000)).toEqual({sparks: 4200, homes: 830});
    expect(scaleRefs(12)).toEqual({sparks: 50, homes: 10});
  });
});
