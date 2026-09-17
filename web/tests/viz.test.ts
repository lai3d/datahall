import {describe, expect, it} from 'vitest';
import {flowPositions, meterFor, pathLength, pointAlong} from '../src/viz.ts';

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
