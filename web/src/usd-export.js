// OpenUSD 导出：纯函数，不依赖 DOM 和 three，可以在 node 里直接测试
// 坐标换算：(x, y, z)_three → (x, -z, y)_usd，Z 轴向上，单位米
import {nearest} from './grid.js';

export function buildUsda(list, CAT, utility, g){
  const PALETTE = {gpu:'#76B900', net:'#9A8CE0', store:'#7FA2C4', coolant:'#3FB6C9', air:'#9AA8B5', copper:'#D08A45', rack:'#34404B', floor:'#2A3540'};
  const f = v => { const s = (Math.round(v * 10000) / 10000).toString(); return s.includes('.') || s.includes('e') ? s : s + '.0'; };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return `(${f((n >> 16 & 255) / 255)}, ${f((n >> 8 & 255) / 255)}, ${f((n & 255) / 255)})`; };
  const str = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const pad = n => String(n).padStart(2, '0');
  const primName = it => `R${pad(it.z + 1)}_C${pad(it.x + 1)}`;
  const pos = it => [(it.x - (g.GW - 1) / 2) * g.CX, -((it.z - (g.GD - 1) / 2) * g.CZ)];
  const EXTENT = 'float3[] extent = [(-0.5, -0.5, -0.5), (0.5, 0.5, 0.5)]';
  const cube = (ind, name, color, t, s) => [
    `${ind}def Cube "${name}"`, `${ind}{`,
    `${ind}    double size = 1`, `${ind}    ${EXTENT}`,
    `${ind}    color3f[] primvars:displayColor = [${rgb(color)}]`,
    `${ind}    double3 xformOp:translate = (${t.map(f).join(', ')})`,
    `${ind}    float3 xformOp:scale = (${s.map(f).join(', ')})`,
    `${ind}    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]`,
    `${ind}}`].join('\n');

  const used = [...new Set(list.map(i => i.type))].filter(id => CAT[id]);
  const cdus = list.filter(i => i.type === 'cdu'), rpps = list.filter(i => i.type === 'rpp');

  const L = [];
  L.push('#usda 1.0', '(',
    '    defaultPrim = "DataHall"',
    '    metersPerUnit = 1',
    '    upAxis = "Z"',
    '    customLayerData = {',
    '        string generator = "GPU Data Hall Builder"',
    '        string "dchall:schemaVersion" = "0.1"',
    '    }',
    ')', '');
  L.push('def Xform "DataHall" (', '    kind = "assembly"', ')', '{');
  L.push(`    custom double dchall:utilityMw = ${f(utility)}`,
    `    custom int dchall:gridColumns = ${g.GW}`, `    custom int dchall:gridRows = ${g.GD}`,
    `    custom double dchall:cellWidthM = ${f(g.CX)}`, `    custom double dchall:cellDepthM = ${f(g.CZ)}`, '');
  L.push(cube('    ', 'Floor', PALETTE.floor, [0, 0, -0.01], [g.GW * g.CX + 0.6, g.GD * g.CZ + 0.6, 0.02]), '');

  L.push('    def Scope "Catalog"', '    {');
  used.forEach(id => {
    const t = CAT[id], h = t.h, accent = PALETTE[t.c.slice(2)] || PALETTE.rack;
    L.push(`        class Xform "${id}"`, '        {',
      `            custom string dchall:displayName = ${str(t.name)}`,
      `            custom token dchall:category = "${t.group}"`,
      `            custom double dchall:powerKw = ${f(t.kw || 0)}`,
      `            custom int dchall:gpuCount = ${t.gpus || 0}`,
      `            custom double dchall:liquidFraction = ${f(t.liq || 0)}`,
      `            custom double dchall:liquidCoolingKw = ${f(t.liqCool || 0)}`,
      `            custom double dchall:airCoolingKw = ${f(t.airCool || 0)}`,
      `            custom double dchall:overheadKw = ${f(t.ovh || 0)}`,
      `            custom double dchall:distributionKw = ${f(t.dist || 0)}`,
      `            custom int dchall:fabricPorts = ${t.ports || 0}`,
      `            custom double dchall:capexMusd = ${f(t.cap || 0)}`,
      `            custom bool dchall:roadmap = ${t.future ? 1 : 0}`,
      `            custom double dchall:heightM = ${f(h)}`, '',
      cube('            ', 'Body', PALETTE.rack, [0, 0, h / 2], [g.CX * .92, g.CZ * .94, h]),
      cube('            ', 'Front', accent, [0, -(g.CZ * .47 + .012), h / 2], [g.CX * .78, .02, h - .3]),
      '        }');
  });
  L.push('    }', '');

  L.push('    def Scope "Equipment"', '    {');
  list.forEach(it => {
    const t = CAT[it.type]; if (!t) return;
    const [px, py] = pos(it);
    L.push(`        def Xform "${primName(it)}" (`, '            kind = "component"', '            instanceable = true',
      `            prepend references = </DataHall/Catalog/${it.type}>`, '        )', '        {',
      `            custom int dchall:gridColumn = ${it.x}`, `            custom int dchall:gridRow = ${it.z}`);
    if (t.liq > 0){ const n = nearest(it, cdus); if (n) L.push(`            custom rel dchall:coolantSource = </DataHall/Equipment/${primName(n.a)}>`); }
    if (t.kw > 0){ const n = nearest(it, rpps); if (n) L.push(`            custom rel dchall:powerFeed = </DataHall/Equipment/${primName(n.a)}>`); }
    L.push(`            double3 xformOp:translate = (${f(px)}, ${f(py)}, 0.0)`,
      '            uniform token[] xformOpOrder = ["xformOp:translate"]', '        }');
  });
  L.push('    }', '}', '');
  return L.join('\n');
}

export const USD_README = `# GPU Data Hall 导出说明

datahall.usda 是 OpenUSD 文本层，Z 轴向上，单位米。

## 结构
/DataHall                  kind=assembly，机房级属性（市电 MW、网格尺寸）
/DataHall/Floor            地板
/DataHall/Catalog/<id>     class 原型，带设备参数和简化几何
/DataHall/Equipment/Rxx_Cyy 摆放的设备，instanceable，引用 Catalog 原型

## 自定义属性（dchall: 命名空间，schema 0.1）
powerKw、gpuCount、liquidFraction、liquidCoolingKw、airCoolingKw、
overheadKw、distributionKw、fabricPorts、capexMusd、roadmap、heightM

## 拓扑关系
dchall:coolantSource → 为该机柜供液的 CDU
dchall:powerFeed     → 为该机柜配电的 RPP

## 替换为高精度模型
在更强的层里对 /DataHall/Catalog/<id> 写 over，把几何替换成厂商 SimReady 资产的引用，
所有摆放实例会自动跟着换，参数和拓扑不受影响。

数值为公开报道与估算的粗略值，不可作为工程设计依据。
`;
