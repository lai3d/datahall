import {CAT} from './catalog.js';
import {GRID, keyOf} from './grid.js';
import {state, itemList, snapshot} from './state.js';
import * as view from './scene.js';
import {initControls} from './controls.js';
import {initUI, buildUI, refresh, renderInfo} from './ui.js';
import {PRESETS, saveLayout, restoreLayout} from './layout.js';
import {buildUsda} from './usd-export.js';
import {importUsda, UsdImportError} from './usd-import.js';
import {createSaver} from './download.js';

const $ = s => document.querySelector(s);

// ---------- mutations ----------
function place(type, x, z, quiet){
  const key = keyOf(x, z);
  if (state.items.has(key)) return;
  const it = {type, x, z};
  view.addMesh(key, it);
  state.items.set(key, it);
  if (!quiet){ state.powered = false; changed(); }
}
function removeItem(key){
  const it = state.items.get(key); if (!it) return;
  view.removeMesh(it);
  state.items.delete(key);
  if (state.selected === key) state.selected = null;
  state.powered = false; changed();
}
function clearAll(){
  state.items.forEach(it => view.removeMesh(it));
  state.items.clear(); state.selected = null; state.powered = false;
}
function select(key){ state.selected = key; view.setOutline(); renderInfo(); }
function changed(){ view.rebuildLinks(); view.setOutline(); refresh(); saveLayout(snapshot()); }

function loadLayout(p){
  clearAll(); state.utility = p.u;
  p.list.forEach(([t, x, z]) => CAT[t] && place(t, x, z, true));
  buildUI(); changed();
}

function tap(e){
  const key = view.pickItem(e);
  if (key){ select(key); return; }
  const c = view.pickCell(e);
  if (c && state.tool && !state.items.has(keyOf(c.x, c.z))){ place(state.tool, c.x, c.z); return; }
  select(null);
}

// ---------- export ----------
// 导入会替换当前机房；警告最多列出 MAX_WARNINGS 条
const MAX_WARNINGS = 8;
function showImportResult(msg, list, text, warnings = []){
  msg.textContent = text;
  const lines = warnings.slice(0, MAX_WARNINGS);
  if (warnings.length > MAX_WARNINGS) lines.push(`另有 ${warnings.length - MAX_WARNINGS} 条提示未列出。`);
  // 提示里有文件中的 prim 名，用 textContent 写入，不当成 HTML
  list.replaceChildren(...lines.map(txt => Object.assign(document.createElement('li'), {className: 'warn', textContent: txt})));
}

function initImport(msg){
  const input = $('#usdFile'), list = $('#usdWarnings');
  $('#usdImport').onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0];
    input.value = '';                                   // 允许再次选择同一个文件
    if (!file) return;
    try {
      const result = importUsda(await file.text(), CAT, GRID);
      loadLayout(result);
      showImportResult(msg, list,
        `已从 ${file.name} 导入 ${result.list.length} 台设备，市电 ${result.u} MW。` + (result.skipped ? `跳过 ${result.skipped} 台。` : ''),
        result.warnings);
    } catch (e) {
      if (!(e instanceof UsdImportError)) console.error(e);
      showImportResult(msg, list, e instanceof UsdImportError ? `没有导入：${e.message}` : '没有导入：读取文件时出错。');
    }
  };
}

async function initExport(){
  const saver = await createSaver();
  const box = $('#usdBox'), msg = $('#usdMsg'), btn = $('#usdExport');
  msg.textContent = saver.hint + 'Z 轴向上，单位米，可直接在 Omniverse、usdview 或 Blender 中打开。';
  box.hidden = false;
  initImport(msg);
  btn.onclick = async () => {
    $('#usdWarnings').innerHTML = '';
    if (!state.items.size){ msg.textContent = '机房是空的，先放设备再导出。'; return; }
    const now = new Date(), date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
    const usda = buildUsda(itemList(), CAT, state.utility, GRID, {date});
    btn.disabled = true;
    try {
      await saver.save(usda);
      msg.textContent = `已导出 ${state.items.size} 台设备。`;
    } catch (e) {
      const code = e && e.code;
      if (code === 'declined') msg.textContent = '已取消导出。';
      else if (code === 'rate_limited') msg.textContent = '已有一个保存确认框，处理完再试。';
      else msg.textContent = '导出失败，当前环境可能不允许下载文件。';
    } finally { btn.disabled = false; }
  };
}

// ---------- boot ----------
const el = view.initScene($('#stage'));
initControls(el, view.camera, {
  onTap: tap,
  onHover: e => view.setGhost(view.pickCell(e)),
  onLeave: view.hideGhost,
  resetButton: $('#camReset'),
});
initUI({
  removeItem,
  setUtility(u){ state.utility = u; state.powered = false; buildUI(); changed(); },
  setTool(id){ state.tool = state.tool === id ? null : id; state.selected = null; view.setOutline(); buildUI(); renderInfo(); },
  togglePower(){ state.powered = !state.powered; state.powerStart = performance.now(); view.rebuildLinks(); refresh(); },
  loadPreset: name => loadLayout(PRESETS[name]),
});
initExport();

const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener && mq.addEventListener('change', () => { view.retheme(); refresh(); });

buildUI();
loadLayout(restoreLayout() || PRESETS.gb200);
view.startLoop();
