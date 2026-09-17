// 导入本项目导出的 OpenUSD 布局（usd-export.js 的逆过程）。纯函数，不依赖 DOM。
// 只读根层，不展开 sublayer 和外部引用；设备参数一律以 catalog.json 为准，文件里的参数只用来提示差异。
// 支持 schema 0.1（custom 属性）和 0.2（applied API schema），以及被 usdview、usdcat、Omniverse 重新保存过的文件。
import {parseUsda, UsdaSyntaxError} from './usda-parser.js';
import {keyOf, FEEDS, supplyLinks} from './grid.js';
import {setFeed} from './feeds.js';
import {tr, loc, catName} from './i18n.js';

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

// 关系的目标 prim 名：只认本层的 </DataHall/Equipment/<name>>，多个目标时取第一个
function relTarget(prim, name){
  const v = plain(valueOf(prim, name));
  const path = (Array.isArray(v) ? v[0] : v)?.path;
  return path?.match(/^\/DataHall\/Equipment\/(\w+)$/)?.[1] ?? null;
}

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
  if (text.startsWith('PXR-USDC')) throw new UsdImportError(tr('usdBinary'));
  let layer;
  try { layer = parseUsda(text); }
  catch (e){
    if (e instanceof UsdaSyntaxError) throw new UsdImportError(tr('usdSyntax', {msg: e.message}));
    throw e;
  }

  const warnings = [];
  const warn = txt => warnings.push(txt);
  const meta = layer.metadata;
  const hallName = meta.defaultPrim || 'DataHall';
  const hall = layer.prims.find(p => p.name === hallName && p.specifier === 'def');
  if (!hall || hallName !== 'DataHall') throw new UsdImportError(tr('usdNoHall'));

  // 位置只看 gridColumn/gridRow，和坐标轴无关；坐标轴只用来核对 translate
  const zUpMeters = meta.upAxis === 'Z' && meta.metersPerUnit === 1;

  const grid = {GW: 'dchall:gridColumns', GD: 'dchall:gridRows', CX: 'dchall:cellWidthM', CZ: 'dchall:cellDepthM'};
  for (const [k, name] of Object.entries(grid)){
    const v = valueOf(hall, name);
    if (v === undefined) warn(tr('usdGridMissing', {name, gw: GRID.GW, gd: GRID.GD, cx: GRID.CX, cz: GRID.CZ}));
    else if (Math.abs(v - GRID[k]) > 1e-6) throw new UsdImportError(tr('usdGridMismatch', {name, v, cur: GRID[k]}));
  }

  let utility = valueOf(hall, 'dchall:utilityMw');
  if (!(typeof utility === 'number' && utility > 0 && Number.isFinite(utility))){
    warn(tr('usdUtility'));
    utility = 2;
  }

  // 文件里的原型参数和当前目录不一致时提示
  for (const proto of child(hall, 'Catalog')?.children || []){
    const t = CAT[proto.name];
    if (!t) continue;
    const diffs = Object.entries(PARAMS)
      .filter(([name, field]) => typeof valueOf(proto, name) === 'number' && Math.abs(valueOf(proto, name) - (t[field] || 0)) > 1e-6)
      .map(([name, field]) => `${name.slice(7)} ${valueOf(proto, name)} → ${t[field] || 0}`);
    if (diffs.length) warn(tr('usdParams', {name: catName(t), diffs: diffs.join(tr('listSep'))}));
  }

  const list = [], seen = new Map(), rels = [];
  let skipped = 0;
  const skip = txt => { warn(txt); skipped++; };
  for (const prim of child(hall, 'Equipment')?.children || []){
    const where = prim.name;
    if (prim.specifier !== 'def') continue;
    if (!isActive(prim)){ skip(tr('usdInactive', {where})); continue; }
    const id = catalogIdOf(prim);
    if (!id){ skip(tr('usdNoProto', {where})); continue; }
    if (!CAT[id]){ skip(tr('usdUnknownType', {where, id})); continue; }

    let x = valueOf(prim, 'dchall:gridColumn'), z = valueOf(prim, 'dchall:gridRow');
    if (!Number.isInteger(x) || !Number.isInteger(z)){
      const m = where.match(/^R(\d\d)_C(\d\d)$/);
      if (!m){ skip(tr('usdNoGrid', {where})); continue; }
      [z, x] = [+m[1] - 1, +m[2] - 1];
      warn(tr('usdGridFromName', {where, loc: loc(x, z)}));
    }
    if (x < 0 || x >= GRID.GW || z < 0 || z >= GRID.GD){ skip(tr('usdOutside', {where, loc: loc(x, z)})); continue; }
    const key = keyOf(x, z);
    if (seen.has(key)){ skip(tr('usdOverlap', {where, other: seen.get(key), loc: loc(x, z)})); continue; }

    // 在 usdview、Omniverse 里拖动过的设备，translate 会和网格位置对不上
    const t = valueOf(prim, 'xformOp:translate');
    if (zUpMeters && Array.isArray(t)){
      const ex = (x - (GRID.GW - 1) / 2) * GRID.CX, ey = -((z - (GRID.GD - 1) / 2) * GRID.CZ);
      if (Math.hypot(t[0] - ex, t[1] - ey) > 0.05) warn(tr('usdTranslate', {where, loc: loc(x, z)}));
    }
    seen.set(key, where);
    list.push([id, x, z]);
    rels.push({where, entry: list.at(-1), targets: Object.fromEntries(Object.keys(FEEDS).map(f => [f, relTarget(prim, 'dchall:' + f)]))});
  }

  // 供给关系：文件里的 dchall:coolantSource / powerFeed 和就近分配不同的，记成手动指定；
  // 指向没导入的设备或类型不对的，提示后按就近处理
  const byName = new Map(rels.map(r => [r.where, r.entry]));
  const auto = supplyLinks(list.map(([type, x, z]) => ({type, x, z})), CAT);
  const autoOf = [...auto.values()];
  rels.forEach(({where, entry, targets}, i) => {
    for (const [field, name] of Object.entries(targets)){
      if (!name) continue;
      const src = byName.get(name);
      if (!src || src[0] !== FEEDS[field].type || !FEEDS[field].needs(CAT[entry[0]])){ warn(tr('usdFeedInvalid', {where, field, target: name})); continue; }
      const a = autoOf[i][field];
      if (a && a.x === src[1] && a.z === src[2]) continue;
      const it = {feeds: entry[3]};
      setFeed(it, field, {x: src[1], z: src[2]});
      entry[3] = it.feeds;
    }
  });

  return {u: utility, list, warnings, skipped};
}
