// 生成一份带手动指定供给设备和部署阶段的 .usda（GB200 预设：两台机柜不接最近的 CDU、RPP，部分设备在第 2、3 阶段），
// 供 tools/test_usd_to_unity.py 核对 pxr 转换器和网页版对这些设备属性的处理一致
// 用法：node scripts/layout-props-usda.js <out.usda>
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.js';
import {CAT} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {PRESETS} from '../src/layout.js';
import {toItems} from '../src/edit.js';

export const PROPS = {
  '4,3': {feeds: {coolantSource: [5, 5]}},
  '11,3': {feeds: {powerFeed: [8, 5]}, phase: 2},
  '10,3': {phase: 2},
  '9,5': {phase: 3},
};

export function propsItems(){
  return toItems(PRESETS.gb200.list).map(it => ({...it, ...PROPS[`${it.x},${it.z}`]}));
}

if (import.meta.url === `file://${process.argv[1]}`){
  writeFileSync(process.argv[2], buildUsda(propsItems(), CAT, PRESETS.gb200.u, GRID, {date: '2026-09-17'}));
}
