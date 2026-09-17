// samples/datahall.usda 既是导出样例，也是回归测试的 golden 文件。
// 布局只记录在样例本身里，所以从样例反解设备清单（按出现顺序）、市电容量和生成日期。
import {readFileSync} from 'node:fs';

export const SAMPLE_PATH = new URL('../../samples/datahall.usda', import.meta.url);

export function parseSampleLayout(src){
  const list = [...src.matchAll(/references = <\/DataHall\/Catalog\/(\w+)>[\s\S]*?gridColumn = (\d+)\s+int dchall:gridRow = (\d+)/g)]
    .map(m => ({type: m[1], x: +m[2], z: +m[3]}));
  return {list, utility: +src.match(/dchall:utilityMw = ([\d.]+)/)[1], date: src.match(/usd_date_generated = "([\d-]+)"/)?.[1]};
}

export const readSample = () => readFileSync(SAMPLE_PATH, 'utf8');
