// OpenUSD 导出：纯函数，不依赖 DOM 和 three，可以在 node 里直接测试
// 坐标换算：(x, y, z)_three → (x, -z, y)_usd，Z 轴向上，单位米
// 属性由 schema/schema.usda 里的 DataHallAPI、DataHallEquipmentAPI、LiquidCooledAPI 定义，
// 改属性时先改 schema，web 测试会检查两边是否一致
import {nearest} from './grid.js';

// meta.date：生成日期 YYYY-MM-DD，由调用方传入以保持纯函数（SimReady SR.001 的 usd_date_generated）
export function buildUsda(list, CAT, utility, g, meta){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta?.date || '')) throw new Error('buildUsda: meta.date must be YYYY-MM-DD');
  const PALETTE = {gpu:'#76B900', net:'#9A8CE0', store:'#7FA2C4', coolant:'#3FB6C9', air:'#9AA8B5', copper:'#D08A45', rack:'#34404B', floor:'#2A3540'};
  const f = v => { const s = (Math.round(v * 10000) / 10000).toString(); return s.includes('.') || s.includes('e') ? s : s + '.0'; };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return `(${f((n >> 16 & 255) / 255)}, ${f((n >> 8 & 255) / 255)}, ${f((n & 255) / 255)})`; };
  const str = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const pad = n => String(n).padStart(2, '0');
  const primName = it => `R${pad(it.z + 1)}_C${pad(it.x + 1)}`;
  const pos = it => [(it.x - (g.GW - 1) / 2) * g.CX, -((it.z - (g.GD - 1) / 2) * g.CZ)];
  // 单位立方体网格：SimReady VG.MESH.001 要求非细分 Mesh。面从外侧看逆时针（rightHanded），法线按面给出
  const BOX = [
    'float3[] extent = [(-0.5, -0.5, -0.5), (0.5, 0.5, 0.5)]',
    'int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]',
    'int[] faceVertexIndices = [0, 3, 2, 1, 4, 5, 6, 7, 0, 1, 5, 4, 2, 3, 7, 6, 1, 2, 6, 5, 3, 0, 4, 7]',
    'normal3f[] normals = [' + [[0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0]]
      .flatMap(n => Array(4).fill(`(${n.join(', ')})`)).join(', ') + '] (',
    '    interpolation = "faceVarying"',
    ')',
    'point3f[] points = [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5), (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5)]',
    'uniform token subdivisionScheme = "none"',
  ];
  const cube = (ind, name, color, t, s, material) => [
    `${ind}def Mesh "${name}" (`, `${ind}    prepend apiSchemas = ["MaterialBindingAPI"]`, `${ind})`, `${ind}{`,
    ...BOX.map(l => `${ind}    ${l}`),
    `${ind}    rel material:binding = <${material}>`,
    `${ind}    color3f[] primvars:displayColor = [${rgb(color)}]`,
    `${ind}    double3 xformOp:translate = (${t.map(f).join(', ')})`,
    `${ind}    float3 xformOp:scale = (${s.map(f).join(', ')})`,
    `${ind}    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]`,
    `${ind}}`].join('\n');
  // UsdPreviewSurface 材质，参数与网页 three.js 的 MeshStandardMaterial 对应
  const material = (ind, path, color, roughness, metallic) => [
    `${ind}def Material "${path.split('/').pop()}"`, `${ind}{`,
    `${ind}    token outputs:surface.connect = <${path}/PreviewSurface.outputs:surface>`, '',
    `${ind}    def Shader "PreviewSurface"`, `${ind}    {`,
    `${ind}        uniform token info:id = "UsdPreviewSurface"`,
    `${ind}        color3f inputs:diffuseColor = ${rgb(color)}`,
    `${ind}        float inputs:metallic = ${f(metallic)}`,
    `${ind}        float inputs:roughness = ${f(roughness)}`,
    `${ind}        token outputs:surface`,
    `${ind}    }`, `${ind}}`].join('\n');

  const used = [...new Set(list.map(i => i.type))].filter(id => CAT[id]);
  const cdus = list.filter(i => i.type === 'cdu'), rpps = list.filter(i => i.type === 'rpp');

  const L = [];
  L.push('#usda 1.0', '(',
    '    defaultPrim = "DataHall"',
    '    metersPerUnit = 1',
    '    upAxis = "Z"',
    '    customLayerData = {',
    '        string asset_name = "datahall"',
    '        string asset_type = "data_hall_layout"',
    '        string "dchall:schemaVersion" = "0.2"',
    '        string generator = "GPU Data Hall Builder"',
    '        dictionary SimReady_Metadata = {',
    '        }',
    '        string source_file = "GPU Data Hall Builder web layout"',
    `        string usd_date_generated = "${meta.date}"`,
    '    }',
    ')', '');
  L.push('def Xform "DataHall" (', '    prepend apiSchemas = ["DataHallAPI"]', '    kind = "assembly"', ')', '{');
  L.push(`    double dchall:utilityMw = ${f(utility)}`,
    `    int dchall:gridColumns = ${g.GW}`, `    int dchall:gridRows = ${g.GD}`,
    `    double dchall:cellWidthM = ${f(g.CX)}`, `    double dchall:cellDepthM = ${f(g.CZ)}`, '');
  L.push(cube('    ', 'Floor', PALETTE.floor, [0, 0, -0.01], [g.GW * g.CX + 0.6, g.GD * g.CZ + 0.6, 0.02], '/DataHall/Looks/floor'), '');
  L.push('    def Scope "Looks"', '    {', material('        ', '/DataHall/Looks/floor', PALETTE.floor, 0.95, 0), '    }', '');

  L.push('    def Scope "Catalog"', '    {');
  used.forEach(id => {
    const t = CAT[id], h = t.h, accent = PALETTE[t.c.slice(2)] || PALETTE.rack;
    const liquid = t.liq > 0, looks = `/DataHall/Catalog/${id}/Looks`;
    const apis = ['DataHallEquipmentAPI', ...(liquid ? ['LiquidCooledAPI'] : [])].map(s => `"${s}"`).join(', ');
    L.push(`        class Xform "${id}" (`, `            prepend apiSchemas = [${apis}]`, '        )', '        {',
      `            string dchall:displayName = ${str(t.name)}`,
      `            token dchall:category = "${t.group}"`,
      `            double dchall:powerKw = ${f(t.kw || 0)}`,
      `            int dchall:gpuCount = ${t.gpus || 0}`,
      ...(liquid ? [`            double dchall:liquidFraction = ${f(t.liq)}`] : []),
      `            double dchall:liquidCoolingKw = ${f(t.liqCool || 0)}`,
      `            double dchall:airCoolingKw = ${f(t.airCool || 0)}`,
      `            double dchall:overheadKw = ${f(t.ovh || 0)}`,
      `            double dchall:distributionKw = ${f(t.dist || 0)}`,
      `            int dchall:fabricPorts = ${t.ports || 0}`,
      `            double dchall:capexMusd = ${f(t.cap || 0)}`,
      `            bool dchall:roadmap = ${t.future ? 1 : 0}`,
      `            double dchall:heightM = ${f(h)}`, '',
      cube('            ', 'Body', PALETTE.rack, [0, 0, h / 2], [g.CX * .92, g.CZ * .94, h], `${looks}/body`),
      cube('            ', 'Front', accent, [0, -(g.CZ * .47 + .012), h / 2], [g.CX * .78, .02, h - .3], `${looks}/front`), '',
      // 材质放在原型内部：实例引用原型时绑定关系随之映射到实例自己的 Looks，不跨出实例边界
      '            def Scope "Looks"', '            {',
      material('                ', `${looks}/body`, PALETTE.rack, 0.55, 0.35),
      material('                ', `${looks}/front`, accent, 0.5, 0),
      '            }',
      '        }');
  });
  L.push('    }', '');

  // component 的祖先必须都是 group 类 kind，否则实例不在模型层级里（OAV KindChecker）
  L.push('    def Scope "Equipment" (', '        kind = "group"', '    )', '    {');
  list.forEach(it => {
    const t = CAT[it.type]; if (!t) return;
    const [px, py] = pos(it);
    L.push(`        def Xform "${primName(it)}" (`, '            kind = "component"', '            instanceable = true',
      `            prepend references = </DataHall/Catalog/${it.type}>`, '        )', '        {',
      `            int dchall:gridColumn = ${it.x}`, `            int dchall:gridRow = ${it.z}`);
    if (t.liq > 0){ const n = nearest(it, cdus); if (n) L.push(`            rel dchall:coolantSource = </DataHall/Equipment/${primName(n.a)}>`); }
    if (t.kw > 0){ const n = nearest(it, rpps); if (n) L.push(`            rel dchall:powerFeed = </DataHall/Equipment/${primName(n.a)}>`); }
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

## 属性 schema（dchall: 命名空间，schema 0.2）
属性由三个 codeless applied API schema 定义：
DataHallAPI           /DataHall 上：utilityMw、gridColumns、gridRows、cellWidthM、cellDepthM
DataHallEquipmentAPI  Catalog 原型上：displayName、category、powerKw、gpuCount、liquidCoolingKw、
                      airCoolingKw、overheadKw、distributionKw、fabricPorts、capexMusd、roadmap、heightM；
                      实例上：gridColumn、gridRow、powerFeed
LiquidCooledAPI       液冷机柜原型上：liquidFraction；实例上：coolantSource

没有加载 schema 插件时，文件照样能打开，属性值也都在，只是会被当成未注册的 API。
要让 usdview 或 Omniverse 识别 schema，把项目仓库的 schema/ 目录加到 PXR_PLUGINPATH_NAME。

## 拓扑关系
dchall:coolantSource → 为该机柜供液的 CDU（LiquidCooledAPI）
dchall:powerFeed     → 为该设备配电的 RPP（DataHallEquipmentAPI）

## 替换为高精度模型
在更强的层里对 /DataHall/Catalog/<id> 写 over，把几何替换成厂商 SimReady 资产的引用，
所有摆放实例会自动跟着换，参数和拓扑不受影响。

数值为公开报道与估算的粗略值，不可作为工程设计依据。
`;
