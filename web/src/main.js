import {CAT} from './catalog.js';
import {GRID, keyOf, FEEDS} from './grid.js';
import {phasesIn} from './growth.js';
import {setFeed, pruneFeeds, retargetFeeds} from './feeds.js';
import {state, itemList, snapshot} from './state.js';
import * as view from './scene.js';
import {initControls} from './controls.js';
import {initUI, buildUI, refresh, renderInfo, applyStaticText} from './ui.js';
import {PRESETS, saveLayout, restoreLayout} from './layout.js';
import {buildUsda} from './usd-export.js';
import {importUsda, UsdImportError} from './usd-import.js';
import {buildLayout, layoutToText} from './layout-export.js';
import {createSaver} from './download.js';
import {encodeLayout, decodeLayout} from './share-link.js';
import {DEFAULT_LANG, setLang, htmlLang, tr} from './i18n.js';
import {lineCells, freeCells, sameLayout, createHistory, toItem} from './edit.js';
import {canFail} from './redundancy.js';

const $ = s => document.querySelector(s);

// ---------- mutations ----------
// 底层操作只改 state 和模型；用户的编辑都包在 edit() 里，布局真的变了才记进撤销历史
const undoStack = createHistory();   // 不叫 history，避免遮住 window.history
// extra：{feeds?, phase?}，来自快照条目
function place(type, x, z, extra = {}){
  const key = keyOf(x, z);
  if (state.items.has(key) || !CAT[type]) return;
  const it = {...extra, type, x, z};
  view.addMesh(key, it);
  state.items.set(key, it);
}
function remove(key){
  const it = state.items.get(key); if (!it) return;
  view.removeMesh(it);
  state.items.delete(key);
  if (state.selected === key) state.selected = null;
}
function clearAll(){
  state.items.forEach(it => view.removeMesh(it));
  state.items.clear(); state.selected = null;
}
function replaceLayout(p){
  clearAll(); state.utility = p.u;
  p.list.map(toItem).forEach(({type, x, z, ...extra}) => place(type, x, z, extra));
}
function edit(fn){
  const before = snapshot();
  fn();
  pruneFeeds(state.items, CAT);   // 删掉或换掉供给设备后，指向它的手动指定失效
  if (!sameLayout(before, snapshot())){ undoStack.record(before); state.powered = false; }
  changed();
}
const removeItem = key => edit(() => remove(key));
// 载入预设、导入文件、打开分享链接是换了一个机房，故障演练清空；撤销和重做保留（格子上的设施还在就保持故障）
const loadLayout = p => edit(() => { state.failed.clear(); state.viewPhase = null; state.phase = 1; replaceLayout(p); });
// 不进撤销历史：启动时载入、撤销和重做本身
function showLayout(p){ replaceLayout(p); state.powered = false; state.rowAnchor = null; changed(); }
function undo(){ if (drag) return; const p = undoStack.undo(snapshot()); if (p) showLayout(p); }
function redo(){ if (drag) return; const p = undoStack.redo(snapshot()); if (p) showLayout(p); }

function select(key){ state.selected = key; state.assignFrom = null; view.setOutline(); renderInfo(); }
function changed(){
  for (const key of state.failed) if (!canFail(CAT[state.items.get(key)?.type])) state.failed.delete(key);
  if (state.assignFrom && !FEED_OF[state.items.get(state.assignFrom)?.type]) state.assignFrom = null;
  // 阶段选择不超过“现有最大阶段 + 1”；查看的阶段不存在了就回到全部
  const phases = phasesIn([...state.items.values()]), maxPhase = phases.at(-1) || 1;
  state.phase = Math.min(state.phase, maxPhase + 1);
  if (state.viewPhase !== null && state.viewPhase >= maxPhase) state.viewPhase = null;
  buildUI(); view.rebuildLinks(); view.setOutline(); refresh(); updateGhost();
  saveLayout(snapshot()); updateShareLink();
  $('#undo').disabled = !undoStack.canUndo;
  $('#redo').disabled = !undoStack.canRedo;
}

// ---------- placement preview ----------
// 单个放置预览鼠标下的空格；整排放置点过第一格后，预览从第一格到鼠标（触屏没有悬停，只显示第一格）
let hoverCell = null;
function updateGhost(){
  let cells = [];
  if (state.tool){
    const end = hoverCell || state.rowAnchor;
    if (state.placeMode === 'row' && state.rowAnchor) cells = lineCells(state.rowAnchor, end);
    else if (end) cells = [end];
  }
  view.setGhost(freeCells(cells, state.items), state.tool);
}

// ---------- drag to move ----------
// 拖到空格就立即挪过去（连线和容量检查跟着更新），占用的格子不动；松手时整个拖动记一条撤销历史。
// 按住设备侧面时指针下的地板是后面的格子，所以按指针移动了几格来挪，而不是挪到指针下的格子
let drag = null;
const dragItem = {
  start(e){
    const key = view.pickItem(e);
    if (!key) return false;
    const it = state.items.get(key), origin = {x: it.x, z: it.z};
    drag = {key, before: snapshot(), moved: false, origin, grab: view.pickCell(e) || origin};
    return true;
  },
  move(e){
    if (!drag) return;
    const p = view.pickCell(e);
    if (!p) return;
    const c = {x: drag.origin.x + p.x - drag.grab.x, z: drag.origin.z + p.z - drag.grab.z};
    const to = keyOf(c.x, c.z);
    if (c.x < 0 || c.x >= GRID.GW || c.z < 0 || c.z >= GRID.GD || to === drag.key || state.items.has(to)) return;
    const it = state.items.get(drag.key);
    state.items.delete(drag.key);
    retargetFeeds(state.items, it, c);   // 挪的是供给设备时，手动接到它的设备跟着
    it.x = c.x; it.z = c.z;
    state.items.set(to, it);
    if (state.assignFrom === drag.key) state.assignFrom = to;
    if (state.failed.delete(drag.key)) state.failed.add(to);
    view.moveMesh(it, to);
    Object.assign(drag, {key: to, moved: true});
    state.selected = to; state.powered = false;
    view.rebuildLinks(); view.setOutline(); refresh();
  },
  end(){
    if (!drag) return;
    const {before, moved} = drag;
    drag = null;
    if (!moved) return;
    if (!sameLayout(before, snapshot())) undoStack.record(before);
    changed();
  },
  cancel(){
    if (!drag) return;
    const {before, moved} = drag;
    drag = null;
    if (moved) showLayout(before);
  },
};

// ---------- failure drill ----------
// 标记故障不改布局：不进撤销历史，不断电，只重算连线和容量检查
function toggleFailed(key){
  const it = state.items.get(key);
  if (!it || !canFail(CAT[it.type])) return;
  if (!state.failed.delete(key)) state.failed.add(key);
  view.rebuildLinks(); refresh();
}
function restoreAll(){ state.failed.clear(); view.rebuildLinks(); refresh(); }

// ---------- growth plan ----------
// 新放的设备进当前选的阶段；如果正在查看更早的阶段，切回全部，免得放下去就看不见
function newProps(){
  if (state.viewPhase !== null && state.phase > state.viewPhase) state.viewPhase = null;
  return state.phase > 1 ? {phase: state.phase} : {};
}
function setItemPhase(key, phase){
  const it = state.items.get(key);
  if (!it) return;
  edit(() => { if (phase > 1) it.phase = phase; else delete it.phase; });
}
// 查看状态不改布局：不进撤销历史，只重算
function setView(fn){ fn(); view.rebuildLinks(); refresh(); buildUI(); }

// ---------- manual supply assignment ----------
// 供给设备类型 → 设备上的字段
const FEED_OF = Object.fromEntries(Object.entries(FEEDS).map(([field, f]) => [f.type, field]));
// 详情面板的下拉框：value 为 'auto'（就近）或 'x,z'
function setFeedChoice(key, field, value){
  const it = state.items.get(key);
  if (!it) return;
  const [x, z] = value === 'auto' ? [] : value.split(',').map(Number);
  edit(() => setFeed(it, field, value === 'auto' ? null : {x, z}));
}
// 指定接入模式：选中一台 CDU / RPP 后点设备，接到它；已经手动接到它的再点一次恢复就近
function toggleAssignMode(key){
  state.assignFrom = state.assignFrom === key || !FEED_OF[state.items.get(key)?.type] ? null : key;
  renderInfo();
}
function assignTap(key){
  const src = state.items.get(state.assignFrom), it = state.items.get(key);
  const field = FEED_OF[src.type];
  if (!FEEDS[field].needs(CAT[it.type])) return;
  const cur = it.feeds?.[field];
  edit(() => setFeed(it, field, cur && cur[0] === src.x && cur[1] === src.z ? null : src));
}

// ---------- keyboard ----------
function escape(){
  if (state.assignFrom){ state.assignFrom = null; renderInfo(); return; }
  if (state.rowAnchor) state.rowAnchor = null;
  else if (state.tool) state.tool = null;
  else if (state.selected){ select(null); return; }
  buildUI(); renderInfo(); updateGhost();
}
function initKeyboard(){
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $('#undo').title = mac ? '⌘Z' : 'Ctrl+Z';
  $('#redo').title = mac ? '⇧⌘Z' : 'Ctrl+Y';
  $('#undo').onclick = undo;
  $('#redo').onclick = redo;
  window.addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y'){ e.preventDefault(); redo(); }
    else if (mod || e.altKey) return;
    else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected){ e.preventDefault(); removeItem(state.selected); }
    else if (e.key === 'Escape') escape();
    else if (k === 'f' && state.selected) toggleFailed(state.selected);
  });
}

// ---------- share link ----------
// 每次改动都把布局写进地址栏的 hash；replaceState 不产生历史记录，也不会触发 hashchange。
// 同时把分享区的提示恢复为默认说明，之后的载入结果或复制结果会覆盖它
function updateShareLink(){
  $('#shareMsg').textContent = tr('shareHint');
  $('#shareWarnings').replaceChildren();
  const hash = encodeLayout(snapshot());
  try { history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search); } catch (e) {}   // claude.ai 沙箱里可能不允许
}

// 打开或粘贴带布局的链接时载入。返回是否载入了链接里的布局。record：是否记进撤销历史（启动时不记）
function loadFromLink(record){
  const link = decodeLayout(location.hash, CAT, GRID);
  if (!link) return false;
  const msg = $('#shareMsg'), list = $('#shareWarnings');
  if (!link.list.length && link.warnings.length){
    showImportResult(msg, list, tr('shareNotLoaded'), link.warnings);
    return false;
  }
  (record ? loadLayout : showLayout)(link);
  showImportResult(msg, list, tr('shareLoaded', {n: link.list.length, u: link.u}), link.warnings);
  return true;
}

function initShare(){
  const msg = $('#shareMsg'), list = $('#shareWarnings');
  $('#shareCopy').onclick = async () => {
    list.replaceChildren();
    if (!state.items.size){ msg.textContent = tr('shareEmpty'); return; }
    updateShareLink();
    try {
      await navigator.clipboard.writeText(location.href);
      msg.textContent = tr('shareCopied', {n: state.items.size});
    } catch (e) {
      msg.textContent = tr('shareCopyFailed');
    }
  };
  window.addEventListener('hashchange', () => loadFromLink(true));
}

function tap(e){
  // 指定接入模式：点设备切换接入，点这台供给设备本身结束，点空地不做什么
  if (state.assignFrom){
    const key = view.pickItem(e);
    if (key === state.assignFrom){ state.assignFrom = null; renderInfo(); }
    else if (key) assignTap(key);
    return;
  }
  // 整排放置：第一下记住起点，第二下把直线上的空格都放上当前设备
  if (state.tool && state.placeMode === 'row'){
    const c = view.pickCell(e);
    if (!c) return;
    if (!state.rowAnchor){ state.rowAnchor = c; state.selected = null; view.setOutline(); buildUI(); renderInfo(); updateGhost(); return; }
    const cells = freeCells(lineCells(state.rowAnchor, c), state.items);
    state.rowAnchor = null;
    edit(() => cells.forEach(p => place(state.tool, p.x, p.z, newProps())));
    return;
  }
  const key = view.pickItem(e);
  if (key){ select(key); return; }
  const c = view.pickCell(e);
  if (c && state.tool && !state.items.has(keyOf(c.x, c.z))){ edit(() => place(state.tool, c.x, c.z, newProps())); return; }
  select(null);
}

// ---------- export ----------
// 导入会替换当前机房；警告最多列出 MAX_WARNINGS 条
const MAX_WARNINGS = 8;
function showImportResult(msg, list, text, warnings = []){
  msg.textContent = text;
  const lines = warnings.slice(0, MAX_WARNINGS);
  if (warnings.length > MAX_WARNINGS) lines.push(tr('moreMessages', {n: warnings.length - MAX_WARNINGS}));
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
        tr('importDone', {file: file.name, n: result.list.length, u: result.u}) + (result.skipped ? tr('importSkipped', {n: result.skipped}) : ''),
        result.warnings);
    } catch (e) {
      if (!(e instanceof UsdImportError)) console.error(e);
      showImportResult(msg, list, e instanceof UsdImportError ? tr('importFailed', {reason: e.message}) : tr('importReadError'));
    }
  };
}

let exportHint = () => '';
async function initExport(){
  const saver = await createSaver();
  const box = $('#usdBox'), msg = $('#usdMsg'), btn = $('#usdExport');
  exportHint = () => saver.hint() + tr('usdHint');
  msg.textContent = exportHint();
  box.hidden = false;
  initImport(msg);
  // 两种导出共用：OpenUSD 层，以及给 Unity 版用的 layout.json（格式见 spec/layout.schema.json）
  const exportWith = (button, filename, build, done) => {
    button.onclick = async () => {
      $('#usdWarnings').innerHTML = '';
      if (!state.items.size){ msg.textContent = tr('exportEmpty'); return; }
      const now = new Date(), date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
      const text = build({date});
      button.disabled = true;
      try {
        await saver.save(filename, text);
        msg.textContent = done();
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') msg.textContent = tr('exportCancelled');
        else if (code === 'rate_limited') msg.textContent = tr('exportBusy');
        else msg.textContent = tr('exportFailed');
      } finally { button.disabled = false; }
    };
  };
  exportWith(btn, 'datahall.usda', meta => buildUsda(itemList(), CAT, state.utility, GRID, meta),
    () => tr('exportUsdDone', {n: state.items.size}));
  exportWith($('#layoutExport'), 'layout.json', meta => layoutToText(buildLayout(itemList(), CAT, state.utility, GRID, meta)),
    () => tr('exportLayoutDone', {n: state.items.size}));
}

// ---------- language ----------
// 默认英文；选择记在 localStorage。?lang=zh 可以直接指定（不写入分享链接的 hash）
const LANG_KEY = 'datahall.lang';
function initialLang(){
  const fromQuery = new URLSearchParams(location.search).get('lang');
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
  return fromQuery || saved || DEFAULT_LANG;
}
function applyLang(id, persist){
  setLang(id);
  if (persist) try { localStorage.setItem(LANG_KEY, id); } catch (e) {}
  document.documentElement.lang = htmlLang();
  applyStaticText();
}
// 切换后重画面板；分享区和导出区的上一条结果提示换成当前语言的默认说明
function switchLang(id){
  applyLang(id, true);
  buildUI(); refresh(); updateShareLink();
  $('#usdMsg').textContent = exportHint();
  $('#usdWarnings').replaceChildren();
}

// ---------- boot ----------
applyLang(initialLang(), false);
const el = view.initScene($('#stage'));
initControls(el, view.camera, {
  onTap: tap,
  onHover: e => { hoverCell = view.pickCell(e); updateGhost(); },
  onLeave: () => { hoverCell = null; updateGhost(); },
  resetButton: $('#camReset'),
  drag: dragItem,
});
initUI({
  removeItem,
  setUtility: u => edit(() => { state.utility = u; }),
  setTool(id){ state.tool = state.tool === id ? null : id; state.selected = null; state.rowAnchor = null; state.assignFrom = null; view.setOutline(); buildUI(); renderInfo(); updateGhost(); },
  setPlaceMode(mode){ state.placeMode = mode; state.rowAnchor = null; buildUI(); updateGhost(); },
  togglePower(){ state.powered = !state.powered; state.powerStart = performance.now(); view.rebuildLinks(); refresh(); },
  loadPreset: name => loadLayout(PRESETS[name]),
  showAlerts: keys => { view.setAlerts(keys); view.setDimmed(); },
  toggleFailed,
  setPlacePhase: n => setView(() => { state.phase = n; if (state.viewPhase !== null && n > state.viewPhase) state.viewPhase = null; }),
  setViewPhase: n => setView(() => { state.viewPhase = n; }),
  setHeadroomType: type => setView(() => { state.headroomType = type; }),
  setItemPhase,
  setFeedChoice,
  toggleAssignMode,
  restoreAll,
  setLang: switchLang,
});
initExport();
initShare();
initKeyboard();

const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener && mq.addEventListener('change', () => { view.retheme(); refresh(); });

if (!loadFromLink(false)) showLayout(restoreLayout() || PRESETS.gb200);
// 开发服务器下给浏览器自动化测试用
if (import.meta.env.DEV) window.__datahall = {state, cellToScreen: view.cellToScreen, visibleGhosts: view.visibleGhosts, renderOnce: view.renderOnce};
view.startLoop();
