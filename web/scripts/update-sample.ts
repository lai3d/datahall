// Run after intentional export format changes: npm run sample, then validate with tools/validate_usd.py and commit
import {writeFileSync} from 'node:fs';
import {buildUsda} from '../src/usd-export.ts';
import {CAT} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {SAMPLE_PATH, parseSampleLayout, readSample} from './sample.ts';

const {list, utility, date} = parseSampleLayout(readSample());
// Keep the sample's original generation date to avoid unrelated diffs on every regeneration; pass --date YYYY-MM-DD to change it
const arg = process.argv.indexOf('--date');
const today = new Date().toISOString().slice(0, 10);
writeFileSync(SAMPLE_PATH, buildUsda(list, CAT, utility, GRID, {date: arg > 0 ? process.argv[arg + 1] : date || today}));
console.log(`samples/datahall.usda: ${list.length} devices, utility ${utility} MW`);
