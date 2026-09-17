// samples/datahall.usda is both the export sample and the golden file for regression tests.
// The layout is recorded only in the sample itself, so the device list (in order of appearance), utility capacity and generation date are recovered from it.
import {readFileSync} from 'node:fs';

export const SAMPLE_PATH = new URL('../../samples/datahall.usda', import.meta.url);

export function parseSampleLayout(src: string): {list: {type: string; x: number; z: number}[]; utility: number; date: string | undefined}{
  const list = [...src.matchAll(/references = <\/DataHall\/Catalog\/(\w+)>[\s\S]*?gridColumn = (\d+)\s+int dchall:gridRow = (\d+)/g)]
    .map(m => ({type: m[1], x: +m[2], z: +m[3]}));
  return {list, utility: +src.match(/dchall:utilityMw = ([\d.]+)/)![1], date: src.match(/usd_date_generated = "([\d-]+)"/)?.[1]};
}

export const readSample = () => readFileSync(SAMPLE_PATH, 'utf8');
