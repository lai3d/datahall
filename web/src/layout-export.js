// layout.json：给 Unity 版的机房布局交换格式，定义见 spec/layout.schema.json。纯函数，不依赖 DOM。
// 同样的内容也由 tools/usd_to_unity.py 从 .usda 生成，两边必须一致（tools/test_usd_to_unity.py 会比对）。
// 结构刻意保持扁平、不用字典，方便 Unity 的 JsonUtility 直接反序列化。
import {equipmentName, supplyLinks} from './grid.js';

export const LAYOUT_FORMAT = 'dchall.layout';
export const LAYOUT_VERSION = 1;

export function catalogEntry(id, t){
  return {
    id, name: t.name, category: t.group,
    powerKw: t.kw || 0, gpuCount: t.gpus || 0, liquidFraction: t.liq || 0,
    liquidCoolingKw: t.liqCool || 0, airCoolingKw: t.airCool || 0, overheadKw: t.ovh || 0,
    distributionKw: t.dist || 0, fabricPorts: t.ports || 0, capexMusd: t.cap || 0,
    roadmap: !!t.future, heightM: t.h,
  };
}

// list: [{type, x, z}]；meta.date：生成日期 YYYY-MM-DD
export function buildLayout(list, CAT, utility, g, meta){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta?.date || '')) throw new Error('buildLayout: meta.date must be YYYY-MM-DD');
  const placed = list.filter(i => CAT[i.type]);
  const links = supplyLinks(placed, CAT);
  const used = [...new Set(placed.map(i => i.type))];
  return {
    format: LAYOUT_FORMAT,
    version: LAYOUT_VERSION,
    generator: 'GPU Data Hall Builder web',
    generated: meta.date,
    grid: {columns: g.GW, rows: g.GD, cellWidthM: g.CX, cellDepthM: g.CZ},
    utilityMw: utility,
    catalog: used.map(id => catalogEntry(id, CAT[id])),
    equipment: placed.map(it => {
      const {coolantSource, powerFeed} = links.get(it);
      return {
        name: equipmentName(it), type: it.type, column: it.x, row: it.z, phase: it.phase || 1,
        powerFeed: powerFeed ? equipmentName(powerFeed) : '',
        coolantSource: coolantSource ? equipmentName(coolantSource) : '',
      };
    }),
  };
}

export const layoutToText = layout => JSON.stringify(layout, null, 2) + '\n';
