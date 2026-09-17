// 导入本项目导出的 OpenUSD 布局（usd-export.js 的逆过程）。纯函数，不依赖 DOM。
// 只读根层，不展开 sublayer 和外部引用；设备参数一律以 catalog.json 为准，文件里的参数只用来提示差异。
// 支持 schema 0.1（custom 属性）和 0.2（applied API schema），以及被 usdview、usdcat、Omniverse 重新保存过的文件。
import {parseUsda, UsdaSyntaxError} from './usda-parser.js';
import {keyOf} from './grid.js';

export class UsdImportError extends Error {}

// Catalog 原型上的 dchall 属性 → catalog.json 字段
const PARAMS = {
  'dchall:powerKw': 'kw', 'dchall:gpuCount': 'gpus', 'dchall:liquidFraction': 'liq',
  'dchall:liquidCoolingKw': 'liqCool', 'dchall:airCoolingKw': 'airCool', 'dchall:overheadKw': 'ovh',
  'dchall:distributionKw': 'dist', 'dchall:fabricPorts': 'ports', 'dchall:capexMusd': 'cap', 'dchall:heightM': 'h',
};

const valueOf = (prim, name) => prim?.props[name]?.value;
const child = (prim, name) => prim?.children.find(c => c.name === name);
const plain = v => (v && typeof v === 'object' && 'op' in v) ? v.value : v;
const isActive = prim => plain(prim.metadata.active) !== false;

// references 可能是单个值或列表，带或不带列表操作；只认本层内的 </DataHall/Catalog/<id>>
function catalogIdOf(prim){
  const refs = [plain(prim.metadata.references)].flat().filter(Boolean);
  for (const r of refs){
    const m = !r.asset && r.path?.match(/^\/DataHall\/Catalog\/(\w+)$/);
    if (m) return m[1];
  }
  return null;
}

export function importUsda(text, CAT, GRID){
  if (text.startsWith('PXR-USDC')) throw new UsdImportError('这是二进制 .usd（usdc）文件，只支持文本 .usda。可以用 usdcat 转换：usdcat in.usd -o out.usda');
  let layer;
  try { layer = parseUsda(text); }
  catch (e){
    if (e instanceof UsdaSyntaxError) throw new UsdImportError(`文件格式有误，${e.message}`);
    throw e;
  }

  const warnings = [];
  const warn = txt => warnings.push(txt);
  const meta = layer.metadata;
  const hallName = meta.defaultPrim || 'DataHall';
  const hall = layer.prims.find(p => p.name === hallName && p.specifier === 'def');
  if (!hall || hallName !== 'DataHall') throw new UsdImportError('没有找到 /DataHall，这个文件不是本工具导出的机房布局。');

  // 位置只看 gridColumn/gridRow，和坐标轴无关；坐标轴只用来核对 translate
  const zUpMeters = meta.upAxis === 'Z' && meta.metersPerUnit === 1;

  const grid = {GW: 'dchall:gridColumns', GD: 'dchall:gridRows', CX: 'dchall:cellWidthM', CZ: 'dchall:cellDepthM'};
  for (const [k, name] of Object.entries(grid)){
    const v = valueOf(hall, name);
    if (v === undefined) warn(`文件没有 ${name}，按 ${GRID.GW} 列 × ${GRID.GD} 排、${GRID.CX} m × ${GRID.CZ} m 的网格导入。`);
    else if (Math.abs(v - GRID[k]) > 1e-6) throw new UsdImportError(`文件的网格 ${name} = ${v}，和当前网格（${GRID[k]}）不一致，无法导入。`);
  }

  let utility = valueOf(hall, 'dchall:utilityMw');
  if (!(typeof utility === 'number' && utility > 0 && Number.isFinite(utility))){
    warn('文件没有有效的 dchall:utilityMw，市电容量按 2 MW 导入。');
    utility = 2;
  }

  // 文件里的原型参数和当前目录不一致时提示
  for (const proto of child(hall, 'Catalog')?.children || []){
    const t = CAT[proto.name];
    if (!t) continue;
    const diffs = Object.entries(PARAMS)
      .filter(([name, field]) => typeof valueOf(proto, name) === 'number' && Math.abs(valueOf(proto, name) - (t[field] || 0)) > 1e-6)
      .map(([name, field]) => `${name.slice(7)} ${valueOf(proto, name)} → ${t[field] || 0}`);
    if (diffs.length) warn(`${t.name} 的参数和当前目录不同（${diffs.join('，')}），按当前目录计算。`);
  }

  const list = [], seen = new Map();
  let skipped = 0;
  const skip = txt => { warn(txt); skipped++; };
  for (const prim of child(hall, 'Equipment')?.children || []){
    const where = prim.name;
    if (prim.specifier !== 'def') continue;
    if (!isActive(prim)){ skip(`${where} 已停用（active = false），未导入。`); continue; }
    const id = catalogIdOf(prim);
    if (!id){ skip(`${where} 没有引用 /DataHall/Catalog 下的设备原型，未导入。`); continue; }
    if (!CAT[id]){ skip(`${where} 的设备类型 ${id} 不在当前目录里，未导入。`); continue; }

    let x = valueOf(prim, 'dchall:gridColumn'), z = valueOf(prim, 'dchall:gridRow');
    if (!Number.isInteger(x) || !Number.isInteger(z)){
      const m = where.match(/^R(\d\d)_C(\d\d)$/);
      if (!m){ skip(`${where} 没有 dchall:gridColumn / gridRow，也无法从名字推断位置，未导入。`); continue; }
      [z, x] = [+m[1] - 1, +m[2] - 1];
      warn(`${where} 没有 dchall:gridColumn / gridRow，按名字放在第 ${x + 1} 列第 ${z + 1} 排。`);
    }
    if (x < 0 || x >= GRID.GW || z < 0 || z >= GRID.GD){ skip(`${where} 的位置（第 ${x + 1} 列第 ${z + 1} 排）超出网格，未导入。`); continue; }
    const key = keyOf(x, z);
    if (seen.has(key)){ skip(`${where} 和 ${seen.get(key)} 占用同一格（第 ${x + 1} 列第 ${z + 1} 排），未导入。`); continue; }

    // 在 usdview、Omniverse 里拖动过的设备，translate 会和网格位置对不上
    const t = valueOf(prim, 'xformOp:translate');
    if (zUpMeters && Array.isArray(t)){
      const ex = (x - (GRID.GW - 1) / 2) * GRID.CX, ey = -((z - (GRID.GD - 1) / 2) * GRID.CZ);
      if (Math.hypot(t[0] - ex, t[1] - ey) > 0.05) warn(`${where} 的 xformOp:translate 和第 ${x + 1} 列第 ${z + 1} 排的位置不一致，按 dchall:gridColumn / gridRow 放置。`);
    }
    seen.set(key, where);
    list.push([id, x, z]);
  }

  return {u: utility, list, warnings, skipped};
}
