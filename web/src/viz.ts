// Pure helpers for the load visualization in scene.ts: the load meter on CDUs and RPPs, and flow dots moving along supply links.
export const METER_SEGMENTS = 5;
export const METER_WARN = .8;   // at or above 80% of capacity the meter turns amber; above 100% it is red (and the device is overloaded)

export type MeterLevel = 'ok' | 'warn' | 'bad';
export interface Meter {lit: number; level: MeterLevel; ratio: number}

// Lit segments round up, so any load lights at least one; a full meter means at or over capacity
export function meterFor(loadKw: number, capacityKw: number): Meter{
  const ratio = capacityKw > 0 ? loadKw / capacityKw : loadKw > 0 ? Infinity : 0;
  const lit = ratio > 0 ? Math.min(METER_SEGMENTS, Math.max(1, Math.ceil(ratio * METER_SEGMENTS - 1e-9))) : 0;
  return {lit, level: ratio > 1 + 1e-9 ? 'bad' : ratio >= METER_WARN - 1e-9 ? 'warn' : 'ok', ratio};
}

export interface Vec {x: number; y: number; z: number}

export function pathLength(pts: Vec[]): number{
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  return n;
}

// The point at arc length s along the polyline, clamped to its ends
export function pointAlong(pts: Vec[], s: number): Vec{
  for (let i = 1; i < pts.length; i++){
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (s <= d || i === pts.length - 1){
      const k = d > 0 ? Math.min(Math.max(s / d, 0), 1) : 0;
      return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k};
    }
    s -= d;
  }
  return {...pts[0]};
}

// Arc positions of the flow dots on a path of the given length after `travel` meters of movement: evenly spaced, wrapping around,
// so the dot count stays constant and the motion is seamless
export function flowPositions(length: number, spacing: number, travel: number): number[]{
  const n = Math.max(1, Math.floor(length / spacing));
  const step = length / n, offset = ((travel % step) + step) % step;
  return Array.from({length: n}, (_, k) => offset + k * step);
}
