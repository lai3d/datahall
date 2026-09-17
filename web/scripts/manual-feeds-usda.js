// 生成一份带手动指定供给设备的 .usda（GB200 预设，两台机柜不接最近的 CDU、RPP），
// 供 tools/test_usd_to_unity.py 核对 pxr 转换器和网页版对手动指定的处理一致
// 用法：node scripts/manual-feeds-usda.js <out.usda>
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.js';
import {CAT} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {PRESETS} from '../src/layout.js';
import {toItems} from '../src/edit.js';

export const MANUAL = {'4,3': {coolantSource: [5, 5]}, '11,3': {powerFeed: [8, 5]}};

export function manualItems(){
  return toItems(PRESETS.gb200.list).map(it => MANUAL[`${it.x},${it.z}`] ? {...it, feeds: MANUAL[`${it.x},${it.z}`]} : it);
}

if (import.meta.url === `file://${process.argv[1]}`){
  writeFileSync(process.argv[2], buildUsda(manualItems(), CAT, PRESETS.gb200.u, GRID, {date: '2026-09-17'}));
}
