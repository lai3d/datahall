import {describe, expect, it} from 'vitest';
import {FRAME_ALL, FRAME_MIN_R, flowPositions, frameFor, meterFor, pathLength, pointAlong} from '../src/viz.ts';
import {GRID} from '../src/grid.ts';

describe('load meter', () => {
  it('lights segments by load, rounding up', () => {
    expect(meterFor(0, 800)).toEqual({lit: 0, level: 'ok', ratio: 0});
    expect(meterFor(10, 800).lit).toBe(1);
    expect(meterFor(320, 800)).toMatchObject({lit: 2, level: 'ok'});
    expect(meterFor(321, 800).lit).toBe(3);
  });
  it('turns amber from 80% and red above capacity', () => {
    expect(meterFor(639, 800).level).toBe('ok');
    expect(meterFor(640, 800)).toMatchObject({lit: 4, level: 'warn'});
    expect(meterFor(800, 800)).toMatchObject({lit: 5, level: 'warn'});
    expect(meterFor(801, 800)).toMatchObject({lit: 5, level: 'bad'});
    expect(meterFor(5, 0)).toMatchObject({lit: 5, level: 'bad'});
  });
});

describe('flow along a link', () => {
  const path = [{x: 0, y: 2, z: 0}, {x: 0, y: 3, z: 0}, {x: 4, y: 3, z: 0}];
  it('measures and walks a polyline', () => {
    expect(pathLength(path)).toBe(5);
    expect(pointAlong(path, .5)).toEqual({x: 0, y: 2.5, z: 0});
    expect(pointAlong(path, 3)).toEqual({x: 2, y: 3, z: 0});
    expect(pointAlong(path, 99)).toEqual({x: 4, y: 3, z: 0});
    expect(pointAlong(path, -1)).toEqual({x: 0, y: 2, z: 0});
  });
  it('keeps dots evenly spaced and wraps them around', () => {
    expect(flowPositions(5, 1, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(flowPositions(5, 1, 7.25).map(v => +v.toFixed(2))).toEqual([.25, 1.25, 2.25, 3.25, 4.25]);
    expect(flowPositions(5.5, 2, 0)).toEqual([0, 2.75]);
    expect(flowPositions(.3, 1, 0)).toEqual([0]);
  });
});

describe('frameFor', () => {
  const cells = (xs: number[], z: number) => xs.map(x => ({x, z}));
  it('shows the whole floor for an empty hall and for a full one', () => {
    expect(frameFor([], GRID)).toEqual(FRAME_ALL);
    const full = frameFor([{x: 0, z: 0}, {x: GRID.GW - 1, z: GRID.GD - 1}], GRID);
    expect(full.r).toBe(FRAME_ALL.r);
    expect(full.x).toBeCloseTo(0);
    expect(full.z).toBeCloseTo(0);
  });
  it('moves in on a small hall and looks at its middle', () => {
    // Eight racks in row 3 and their support in row 5, the default GB200 hall
    const f = frameFor([...cells([4, 5, 6, 7, 8, 9, 10, 11], 3), ...cells([4, 5, 6, 7, 8, 9, 10, 11], 5)], GRID);
    expect(f.r).toBeGreaterThan(FRAME_MIN_R);
    expect(f.r).toBeLessThan(12);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-.5 * GRID.CZ);
  });
  it('never comes closer than the minimum, and a bigger hall is seen from further away', () => {
    const one = frameFor([{x: 2, z: 2}], GRID), row = frameFor(cells([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 2), GRID);
    expect(one.r).toBe(FRAME_MIN_R);
    expect(row.r).toBeGreaterThan(one.r);
    expect(one.x).toBeLessThan(0);
    expect(one.z).toBeLessThan(0);
  });
});
