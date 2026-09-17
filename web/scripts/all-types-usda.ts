// 生成一份目录里每种设备各一台的 .usda，供 tools/unity_sync.sh 为 Unity 转换全部设备模型
// 用法：node scripts/all-types-usda.ts <out.usda>
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';

writeFileSync(process.argv[2], buildUsda(CATALOG.map((t, i) => ({type: t.id, x: i, z: 0})), CAT, 10, GRID, {date: '2026-09-17'}));
