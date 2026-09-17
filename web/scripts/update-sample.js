// 导出格式有意变更后运行：npm run sample，然后用 tools/validate_usd.py 校验并提交
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.js';
import {CAT} from '../src/catalog.js';
import {GRID} from '../src/grid.js';
import {SAMPLE_PATH, parseSampleLayout, readSample} from './sample.js';

const {list, utility} = parseSampleLayout(readSample());
writeFileSync(SAMPLE_PATH, buildUsda(list, CAT, utility, GRID));
console.log(`samples/datahall.usda: ${list.length} 台设备，市电 ${utility} MW`);
