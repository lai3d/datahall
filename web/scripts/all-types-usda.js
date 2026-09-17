// 生成一份目录里每种设备各一台的 .usda，供 tools/unity_sync.sh 为 Unity 转换全部设备模型
// 用法：node scripts/all-types-usda.js <out.usda>
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.js';
import {CAT, CATALOG} from '../src/catalog.js';
import {GRID} from '../src/grid.js';

writeFileSync(process.argv[2], buildUsda(CATALOG.map((t, i) => ({type: t.id, x: i, z: 0})), CAT, 10, GRID, {date: '2026-09-17'}));
