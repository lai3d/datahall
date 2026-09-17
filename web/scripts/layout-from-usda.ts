// Converts .usda to layout.json on stdout using the web version's import and export logic.
// tools/test_usd_to_unity.py uses it to cross-check the output of the pxr converter.
// Usage: node scripts/layout-from-usda.ts <file.usda> [--date YYYY-MM-DD]
import {readFileSync} from 'node:fs';
import {importUsda} from '../src/usd-import.ts';
import {buildLayout, layoutToText} from '../src/layout-export.ts';
import {CAT} from '../src/catalog.ts';
import {GRID} from '../src/grid.ts';
import {toItems} from '../src/edit.ts';

const [file] = process.argv.slice(2);
const arg = process.argv.indexOf('--date');
const date = arg > 0 ? process.argv[arg + 1] : new Date().toISOString().slice(0, 10);
const {u, list, warnings} = importUsda(readFileSync(file, 'utf8'), CAT, GRID);
warnings.forEach(w => console.error('warning:', w));
process.stdout.write(layoutToText(buildLayout(toItems(list), CAT, u, GRID, {date})));
