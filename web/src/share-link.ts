// Share links: encode the hall layout into the URL hash, so opening the link shows the same hall. Pure functions, no DOM dependency.
// Format: #layout=<version>,<utility MW>,<type>:<col>.<row>-<col>.<row>,<type>:...
// e.g. #layout=1,5,vr200:3.3-4.3,cdu:3.5   columns and rows start at 0, matching gridColumn/gridRow in layout.json and USD.
// Version 2 appends manually assigned supply equipment: @c:<col>.<row>_<CDU col>.<CDU row>-... (coolant), @p:... (power).
// Version 3 also adds deployment phases: @<phase>:<col>.<row>-... (only devices with phase greater than 1).
// Encoding uses the lowest version that can express the content: 2 without phases, 1 without manual assignments either, so links already shared and old pages are unaffected
// Hash only, no query parameters: the hash is never sent to the server, and static hosting needs no configuration.
import {MAX_PHASE} from './growth.ts';
import {keyOf} from './grid.ts';
import {tr, loc, catName} from './i18n.ts';
import {FEEDS} from './grid.ts';
import {setFeed} from './feeds.ts';
import {entryProps} from './edit.ts';
import type {Catalog, Entry, FeedField, Grid, Layout} from './types.ts';

export interface DecodedLayout extends Layout {warnings: string[]}

export const LINK_KEY = 'layout';
export const LINK_VERSION = 3;   // Latest version; decoding supports 1, 2, 3
const FEED_TAGS: Record<FeedField, string> = {coolantSource: '@c', powerFeed: '@p'};
const FEED_FIELDS = Object.keys(FEED_TAGS) as FeedField[];

// p: {u: utility MW, list: [[type, x, z, props?], ...]}; returns the hash content without #; an empty hall returns an empty string
export function encodeLayout(p: Layout): string{
  if (!p.list.length) return '';
  const groups = new Map<string, string[]>();
  const feeds: Record<FeedField, string[]> = {coolantSource: [], powerFeed: []};
  const phases = new Map<number, string[]>();
  for (const entry of p.list){
    const [type, x, z] = entry, {feeds: f, phase} = entryProps(entry);
    if (phase && phase > 1){ if (!phases.has(phase)) phases.set(phase, []); phases.get(phase)!.push(`${x}.${z}`); }
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(`${x}.${z}`);
    for (const field of FEED_FIELDS){ const c = f?.[field]; if (c) feeds[field].push(`${x}.${z}_${c[0]}.${c[1]}`); }
  }
  const parts = [...groups].map(([type, cells]) => `${type}:${cells.join('-')}`);
  const assigned = FEED_FIELDS.filter(field => feeds[field].length).map(field => `${FEED_TAGS[field]}:${feeds[field].join('-')}`);
  const phased = [...phases].sort((a, b) => a[0] - b[0]).map(([n, cells]) => `@${n}:${cells.join('-')}`);
  const version = phased.length ? 3 : assigned.length ? 2 : 1;
  return `${LINK_KEY}=${[version, p.u, ...parts, ...assigned, ...phased].join(',')}`;
}

// hash: location.hash (# optional). Returns null if the hash has no layout; otherwise {u, list, warnings}
export function decodeLayout(hash: string, CAT: Catalog, GRID: Grid): DecodedLayout | null{
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get(LINK_KEY);
  if (raw === null) return null;
  const warnings: string[] = [];
  const [version, utility, ...groups] = raw.split(',');
  const v = Number(version);
  if (v !== 1 && v !== 2 && v !== 3) return {u: 2, list: [], warnings: [tr('linkVersion', {v: version})]};
  let u = Number(utility);
  if (!(u > 0 && Number.isFinite(u))){
    warnings.push(tr('linkUtility'));
    u = 2;
  }
  const list: Entry[] = [], seen = new Set<string>(), assigned: [string, string][] = [];
  for (const group of groups){
    const [type, cells = ''] = group.split(':');
    if (v >= 2 && type.startsWith('@')){ assigned.push([type, cells]); continue; }
    if (!Object.hasOwn(CAT, type)){ warnings.push(tr('linkType', {type})); continue; }
    for (const cell of cells.split('-').filter(Boolean)){
      const m = cell.match(/^(\d+)\.(\d+)$/);
      if (!m){ warnings.push(tr('linkCell', {cell: `${type}:${cell}`})); continue; }
      const x = +m[1], z = +m[2];
      if (x >= GRID.GW || z >= GRID.GD){ warnings.push(tr('linkOutside', {name: catName(CAT[type]), loc: loc(x, z)})); continue; }
      if (seen.has(keyOf(x, z))){ warnings.push(tr('linkOverlap', {name: catName(CAT[type]), loc: loc(x, z)})); continue; }
      seen.add(keyOf(x, z));
      list.push([type, x, z]);
    }
  }
  // Manual assignments: both ends must be devices loaded from the link, the supply type must match, and the device must need that supply
  const byKey = new Map(list.map(e => [keyOf(e[1], e[2]), e]));
  const propsOf = (e: Entry) => entryProps(e);
  for (const [tag, pairs] of assigned){
    // Deployment phase (version 3)
    const phase = v === 3 && /^@\d+$/.test(tag) ? Number(tag.slice(1)) : null;
    if (phase !== null){
      if (phase < 2 || phase > MAX_PHASE){ warnings.push(tr('linkType', {type: tag})); continue; }
      for (const cell of pairs.split('-').filter(Boolean)){
        const m = cell.match(/^(\d+)\.(\d+)$/), dev = m && byKey.get(keyOf(+m[1], +m[2]));
        if (!dev){ warnings.push(tr('linkCell', {cell: `${tag}:${cell}`})); continue; }
        dev[3] = {...propsOf(dev), phase};
      }
      continue;
    }
    const field = FEED_FIELDS.find(f => FEED_TAGS[f] === tag);
    if (!field){ warnings.push(tr('linkType', {type: tag})); continue; }
    for (const pair of pairs.split('-').filter(Boolean)){
      const m = pair.match(/^(\d+)\.(\d+)_(\d+)\.(\d+)$/);
      if (!m){ warnings.push(tr('linkCell', {cell: `${tag}:${pair}`})); continue; }
      const dev = byKey.get(keyOf(+m[1], +m[2])), src = byKey.get(keyOf(+m[3], +m[4]));
      if (!dev || !src || src[0] !== FEEDS[field].type || !FEEDS[field].needs(CAT[dev[0]])){ warnings.push(tr('linkFeed', {loc: loc(+m[1], +m[2])})); continue; }
      const props = propsOf(dev), it = {feeds: props.feeds};
      setFeed(it, field, {x: src[1], z: src[2]});
      dev[3] = {...props, feeds: it.feeds};
    }
  }
  return {u, list, warnings};
}
