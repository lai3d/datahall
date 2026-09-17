// Generates a .usda with one device of each catalog type, so tools/unity_sync.sh can convert every device model for Unity
// Usage: node scripts/all-types-usda.ts <out.usda>
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.ts';
import {CAT, CATALOG} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';

writeFileSync(process.argv[2], buildUsda(CATALOG.map((t, i) => ({type: t.id, x: i, z: 0})), CAT, 10, GRID, {date: '2026-09-17'}));
