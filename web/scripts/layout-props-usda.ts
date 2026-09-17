// Generates a .usda with manually assigned supply equipment and deployment phases (GB200 preset: two racks not connected to the nearest CDU/RPP, some devices in phases 2 and 3),
// so tools/test_usd_to_unity.py can check that the pxr converter and the web version handle these device properties the same way
// Usage: node scripts/layout-props-usda.ts <out.usda>
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.ts';
import {CAT} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {PRESETS} from '../src/layout.ts';
import type {EntryProps, Item} from '../src/types.ts';
import {toItems} from '../src/edit.ts';

export const PROPS: Record<string, EntryProps> = {
  '4,3': {feeds: {coolantSource: [5, 5]}},
  '11,3': {feeds: {powerFeed: [8, 5]}, phase: 2},
  '10,3': {phase: 2},
  '9,5': {phase: 3},
};

export function propsItems(): Item[]{
  return toItems(PRESETS.gb200.list).map(it => ({...it, ...PROPS[`${it.x},${it.z}`]}));
}

if (import.meta.url === `file://${process.argv[1]}`){
  writeFileSync(process.argv[2], buildUsda(propsItems(), CAT, PRESETS.gb200.u, GRID, {date: '2026-09-17'}));
}
