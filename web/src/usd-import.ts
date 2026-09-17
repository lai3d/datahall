// Imports OpenUSD layouts exported by this project (the inverse of usd-export.ts). Pure functions, no DOM dependency.
// Reads the root layer only, without expanding sublayers or external references; device parameters always come from catalog.json, and parameters in the file only produce difference warnings.
// Supports schema 0.1 (custom attributes) and 0.2 (applied API schemas), as well as files re-saved by usdview, usdcat or Omniverse.
import {parseUsda, UsdaSyntaxError} from './usda-parser.ts';
import {keyOf, FEEDS, supplyLinks} from './grid.ts';
import {setFeed} from './feeds.ts';
import {tr, loc, catName} from './i18n.ts';
import type {UsdPrim} from './usda-parser.ts';
import type {Catalog, CatalogItem, Entry, EntryProps, FeedField, Grid} from './types.ts';

export interface ImportResult {u: number; list: Entry[]; warnings: string[]; skipped: number}

export class UsdImportError extends Error {}

// dchall attributes on Catalog prototypes → catalog.json fields
const PARAMS: Record<string, keyof CatalogItem> = {
  'dchall:powerKw': 'kw', 'dchall:gpuCount': 'gpus', 'dchall:liquidFraction': 'liq',
  'dchall:liquidCoolingKw': 'liqCool', 'dchall:airCoolingKw': 'airCool', 'dchall:overheadKw': 'ovh',
  'dchall:distributionKw': 'dist', 'dchall:fabricPorts': 'ports', 'dchall:capexMusd': 'cap', 'dchall:heightM': 'h',
};

// Value shapes in the file are untrusted, so they are read as any and checked at runtime wherever used
const valueOf = (prim: UsdPrim | undefined, name: string): any => prim?.props[name]?.value;
const child = (prim: UsdPrim | undefined, name: string): UsdPrim | undefined => prim?.children.find(c => c.name === name);
const plain = (v: any): any => (v && typeof v === 'object' && 'op' in v) ? v.value : v;
const isActive = (prim: UsdPrim): boolean => plain(prim.metadata.active) !== false;

// Target prim name of a relationship: only </DataHall/Equipment/<name>> in this layer is accepted; with multiple targets, take the first
function relTarget(prim: UsdPrim, name: string): string | null{
  const v = plain(valueOf(prim, name));
  const path = (Array.isArray(v) ? v[0] : v)?.path;
  return path?.match(/^\/DataHall\/Equipment\/(\w+)$/)?.[1] ?? null;
}

// references may be a single value or a list, with or without a list op; only </DataHall/Catalog/<id>> within this layer is accepted
function catalogIdOf(prim: UsdPrim): string | null{
  const refs = [plain(prim.metadata.references)].flat().filter(Boolean);
  for (const r of refs){
    const m = !r.asset && r.path?.match(/^\/DataHall\/Catalog\/(\w+)$/);
    if (m) return m[1];
  }
  return null;
}

export function importUsda(text: string, CAT: Catalog, GRID: Grid): ImportResult{
  if (text.startsWith('PXR-USDC')) throw new UsdImportError(tr('usdBinary'));
  let layer;
  try { layer = parseUsda(text); }
  catch (e){
    if (e instanceof UsdaSyntaxError) throw new UsdImportError(tr('usdSyntax', {msg: e.message}));
    throw e;
  }

  const warnings: string[] = [];
  const warn = (txt: string) => warnings.push(txt);
  const meta = layer.metadata;
  const hallName = (meta.defaultPrim as string | undefined) || 'DataHall';
  const hall = layer.prims.find(p => p.name === hallName && p.specifier === 'def');
  if (!hall || hallName !== 'DataHall') throw new UsdImportError(tr('usdNoHall'));

  // Position comes only from gridColumn/gridRow, independent of the up axis; the up axis is used only to verify translate
  const zUpMeters = meta.upAxis === 'Z' && meta.metersPerUnit === 1;

  const grid: Record<keyof Grid, string> = {GW: 'dchall:gridColumns', GD: 'dchall:gridRows', CX: 'dchall:cellWidthM', CZ: 'dchall:cellDepthM'};
  for (const [k, name] of Object.entries(grid) as [keyof Grid, string][]){
    const v = valueOf(hall, name);
    if (v === undefined) warn(tr('usdGridMissing', {name, gw: GRID.GW, gd: GRID.GD, cx: GRID.CX, cz: GRID.CZ}));
    else if (Math.abs(v - GRID[k]) > 1e-6) throw new UsdImportError(tr('usdGridMismatch', {name, v, cur: GRID[k]}));
  }

  let utility = valueOf(hall, 'dchall:utilityMw');
  if (!(typeof utility === 'number' && utility > 0 && Number.isFinite(utility))){
    warn(tr('usdUtility'));
    utility = 2;
  }

  // Warn when prototype parameters in the file differ from the current catalog
  for (const proto of child(hall, 'Catalog')?.children || []){
    const t = CAT[proto.name];
    if (!t) continue;
    const diffs = Object.entries(PARAMS)
      .filter(([name, field]) => typeof valueOf(proto, name) === 'number' && Math.abs(valueOf(proto, name) - (Number(t[field]) || 0)) > 1e-6)
      .map(([name, field]) => `${name.slice(7)} ${valueOf(proto, name)} → ${Number(t[field]) || 0}`);
    if (diffs.length) warn(tr('usdParams', {name: catName(t), diffs: diffs.join(tr('listSep'))}));
  }

  const list: Entry[] = [], seen = new Map<string, string>();
  const rels: {where: string; entry: Entry; targets: Record<FeedField, string | null>}[] = [];
  let skipped = 0;
  const skip = (txt: string) => { warn(txt); skipped++; };
  for (const prim of child(hall, 'Equipment')?.children || []){
    const where = prim.name;
    if (prim.specifier !== 'def') continue;
    if (!isActive(prim)){ skip(tr('usdInactive', {where})); continue; }
    const id = catalogIdOf(prim);
    if (!id){ skip(tr('usdNoProto', {where})); continue; }
    if (!CAT[id]){ skip(tr('usdUnknownType', {where, id})); continue; }

    let x = valueOf(prim, 'dchall:gridColumn'), z = valueOf(prim, 'dchall:gridRow');
    if (!Number.isInteger(x) || !Number.isInteger(z)){
      const m = where.match(/^R(\d\d)_C(\d\d)$/);
      if (!m){ skip(tr('usdNoGrid', {where})); continue; }
      [z, x] = [+m[1] - 1, +m[2] - 1];
      warn(tr('usdGridFromName', {where, loc: loc(x, z)}));
    }
    if (x < 0 || x >= GRID.GW || z < 0 || z >= GRID.GD){ skip(tr('usdOutside', {where, loc: loc(x, z)})); continue; }
    const key = keyOf(x, z);
    if (seen.has(key)){ skip(tr('usdOverlap', {where, other: seen.get(key)!, loc: loc(x, z)})); continue; }

    // Devices dragged in usdview or Omniverse will have a translate that does not match the grid position
    const t = valueOf(prim, 'xformOp:translate');
    if (zUpMeters && Array.isArray(t)){
      const ex = (x - (GRID.GW - 1) / 2) * GRID.CX, ey = -((z - (GRID.GD - 1) / 2) * GRID.CZ);
      if (Math.hypot(t[0] - ex, t[1] - ey) > 0.05) warn(tr('usdTranslate', {where, loc: loc(x, z)}));
    }
    seen.set(key, where);
    const phase = valueOf(prim, 'dchall:phase');
    if (phase !== undefined && !(Number.isInteger(phase) && phase >= 1)) warn(tr('usdPhase', {where, v: phase}));
    list.push(Number.isInteger(phase) && phase > 1 ? [id, x, z, {phase}] : [id, x, z]);
    rels.push({where, entry: list.at(-1)!, targets: {coolantSource: relTarget(prim, 'dchall:coolantSource'), powerFeed: relTarget(prim, 'dchall:powerFeed')}});
  }

  // Supply relations: dchall:coolantSource / powerFeed values in the file that differ from nearest assignment are recorded as manual assignments;
  // those pointing to devices not imported or of the wrong type produce a warning and fall back to nearest
  const byName = new Map(rels.map(r => [r.where, r.entry]));
  const auto = supplyLinks(list.map(([type, x, z]) => ({type, x, z})), CAT);
  const autoOf = [...auto.values()];
  rels.forEach(({where, entry, targets}, i) => {
    for (const [field, name] of Object.entries(targets) as [FeedField, string | null][]){
      if (!name) continue;
      const src = byName.get(name);
      if (!src || src[0] !== FEEDS[field].type || !FEEDS[field].needs(CAT[entry[0]])){ warn(tr('usdFeedInvalid', {where, field, target: name})); continue; }
      const a = autoOf[i][field];
      if (a && a.x === src[1] && a.z === src[2]) continue;
      const props = (entry[3] || {}) as EntryProps, it = {feeds: props.feeds};
      setFeed(it, field, {x: src[1], z: src[2]});
      entry[3] = {...props, feeds: it.feeds};
    }
  });

  return {u: utility, list, warnings, skipped};
}
