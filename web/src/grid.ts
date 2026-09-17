// Hall grid: 16 columns × 10 rows, cells 0.6m × 1.2m
import type {Catalog, CatalogItem, FeedField, Grid, Item, Pos} from './types.ts';

export const GRID: Grid = {GW: 16, GD: 10, CX: 0.6, CZ: 1.2};

export const keyOf = (x: number, z: number): string => x + ',' + z;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

// Nearest supply equipment (CDU / RPP); cross-row distance is doubled to prefer the same row
// Ties go to the lower row, then the lower column, so the result depends only on positions and not on list
// order (dragging a device moves it to the end of the list)
export const nearest = <T extends Pos>(it: Pos, arr: T[]): {a: T; d: number} | null => arr.reduce<{a: T; d: number} | null>((b, a) => {
  const d = Math.hypot(a.x - it.x, (a.z - it.z) * 2);
  if (!b || d < b.d - 1e-9) return {a, d};
  return Math.abs(d - b.d) <= 1e-9 && (a.z - b.a.z || a.x - b.a.x) < 0 ? {a, d} : b;
}, null);

// Device name: row z+1, column x+1, e.g. R04_C05 (shared by USD prim names and layout.json)
export const equipmentName = (it: Pos): string => `R${String(it.z + 1).padStart(2, '0')}_C${String(it.x + 1).padStart(2, '0')}`;

// The two supply relations: field name → supply equipment type, and which devices need it
export const FEEDS: Record<FeedField, {type: 'cdu' | 'rpp'; needs: (t: CatalogItem) => boolean}> = {
  coolantSource: {type: 'cdu', needs: t => (t.liq || 0) > 0},
  powerFeed: {type: 'rpp', needs: t => (t.kw || 0) > 0},
};
export const FEED_FIELDS = Object.keys(FEEDS) as FeedField[];

export type Links<T extends Item> = Record<FeedField, T | null>;

// Supply relations: liquid-cooled devices connect to a CDU, devices with IT load connect to an RPP. By default the nearest one;
// if the device has a manual assignment (it.feeds = {coolantSource: [x, z], powerFeed: [x, z]}, both optional) and that cell really holds the matching supply equipment, connect to that one,
// otherwise (deleted, moved, removed in a failure drill) fall back to the nearest. Returns Map(device → {coolantSource, powerFeed}), null where there is none
export function supplyLinks<T extends Item>(list: T[], CAT: Catalog): Map<T, Links<T>>{
  const pools: Record<FeedField, T[]> = {coolantSource: list.filter(i => i.type === 'cdu'), powerFeed: list.filter(i => i.type === 'rpp')};
  const pick = (it: T, field: FeedField): T | null => {
    if (!FEEDS[field].needs(CAT[it.type])) return null;
    const want = it.feeds?.[field];
    const manual = want && pools[field].find(s => s.x === want[0] && s.z === want[1]);
    return manual || (nearest(it, pools[field])?.a ?? null);
  };
  return new Map(list.filter(i => CAT[i.type]).map(it => [it, {coolantSource: pick(it, 'coolantSource'), powerFeed: pick(it, 'powerFeed')}]));
}
