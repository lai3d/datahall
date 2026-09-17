// 导出格式有意变更后运行：npm run sample，然后用 tools/validate_usd.py 校验并提交
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.ts';
import {CAT} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {SAMPLE_PATH, parseSampleLayout, readSample} from './sample.ts';

const {list, utility, date} = parseSampleLayout(readSample());
// 沿用样例原有的生成日期，避免每次重新生成都产生无关的 diff；传 --date YYYY-MM-DD 可以改
const arg = process.argv.indexOf('--date');
const today = new Date().toISOString().slice(0, 10);
writeFileSync(SAMPLE_PATH, buildUsda(list, CAT, utility, GRID, {date: arg > 0 ? process.argv[arg + 1] : date || today}));
console.log(`samples/datahall.usda: ${list.length} 台设备，市电 ${utility} MW`);
