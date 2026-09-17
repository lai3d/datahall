import {CAT} from './catalog.js';
import {GRID, keyOf} from './grid.js';
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
function changed(){ view.rebuildLinks(); view.setOutline(); refresh(); saveLayout(snapshot()); updateShareLink(); }

// ---------- share link ----------
// 每次改动都把布局写进地址栏的 hash；replaceState 不产生历史记录，也不会触发 hashchange。
// 同时把分享区的提示恢复为默认说明，之后的载入结果或复制结果会覆盖它
function updateShareLink(){
  $('#shareMsg').textContent = tr('shareHint');
  $('#shareWarnings').replaceChildren();
  const hash = encodeLayout(snapshot());
  try { history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search); } catch (e) {}   // claude.ai 沙箱里可能不允许
}

// 打开或粘贴带布局的链接时载入。返回是否载入了链接里的布局
function loadFromLink(){
  const link = decodeLayout(location.hash, CAT, GRID);
  if (!link) return false;
  const msg = $('#shareMsg'), list = $('#shareWarnings');
  if (!link.list.length && link.warnings.length){
    showImportResult(msg, list, tr('shareNotLoaded'), link.warnings);
    return false;
  }
  loadLayout(link);
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
  window.addEventListener('hashchange', loadFromLink);
}

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
  showAlerts: keys => view.setAlerts(keys),
  setLang: switchLang,
});
initExport();
initShare();

const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener && mq.addEventListener('change', () => { view.retheme(); refresh(); });

buildUI();
if (!loadFromLink()) loadLayout(restoreLayout() || PRESETS.gb200);
view.startLoop();
