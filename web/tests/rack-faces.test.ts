// The 3D front is drawn from the same parts the details panel lists, so the counts must survive the layout
import {describe, expect, it} from 'vitest';
import {partsStack} from '../src/rack-faces.ts';
import {CATALOG} from '../src/catalog.ts';

const count = (stack: ReturnType<typeof partsStack>, kind: string) => stack.filter(([k]) => k === kind).reduce((n, [, , r = 1]) => n + r, 0);

describe('rack fronts from documented parts', () => {
  it('NVL72: 18 compute trays split around 9 NVLink switch trays, power shelves at both ends', () => {
    const s = partsStack(CATALOG.find(t => t.id === 'gb300')!.parts!);
    expect(count(s, 'compute')).toBe(18);
    expect(count(s, 'switch')).toBe(9);
    expect(count(s, 'psu')).toBe(8);
    expect(s.map(([k]) => k).slice(0, 5)).toEqual(['psu', 'compute', 'switch', 'compute', 'psu']);
    expect(count(partsStack(CATALOG.find(t => t.id === 'vr200')!.parts!), 'psu')).toBe(4);
  });

  it('every rack with parts draws one unit per documented unit', () => {
    for (const t of CATALOG.filter(t => t.parts && !t.parts.some(p => p.kind === 'nvswitch'))){
      const s = partsStack(t.parts!);
      const drawn = count(s, 'grill') + count(s, 'ports') + (t.parts!.some(p => p.kind === 'npunode') ? count(s, 'compute') : 0);
      expect(drawn, t.id).toBe(t.parts!.reduce((n, p) => n + p.n, 0));
    }
  });

  it('fills the rest of the rack with blank panels', () => {
    for (const t of CATALOG.filter(t => t.parts)){
      const s = partsStack(t.parts!);
      expect(s.reduce((u, [, h, r = 1]) => u + h * r, 0), t.id).toBeGreaterThanOrEqual(44);
    }
  });
});
