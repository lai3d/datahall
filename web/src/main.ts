import {CAT} from './catalog.ts';
import {GRID, keyOf, FEEDS} from './grid.ts';
import {phasesIn} from './growth.ts';
import {setFeed, pruneFeeds, retargetFeeds} from './feeds.ts';
import {state, itemList, snapshot} from './state.ts';
import * as view from './scene.ts';
import {initControls} from './controls.ts';
import type {DragHandlers} from './controls.ts';
import {initUI, buildUI, refresh, renderInfo, applyStaticText} from './ui.ts';
import {PRESETS, saveLayout, restoreLayout} from './layout.ts';
import {buildUsda} from './usd-export.ts';
import {importUsda, UsdImportError} from './usd-import.ts';
import {buildLayout, layoutToText} from './layout-export.ts';
import {createSaver} from './download.ts';
import {encodeLayout, decodeLayout} from './share-link.ts';
import {DEFAULT_LANG, setLang, htmlLang, tr} from './i18n.ts';
import {lineCells, freeCells, sameLayout, createHistory, toItem} from './edit.ts';
import {canFail} from './redundancy.ts';
import {hasShareLink, initAnalytics} from './analytics.ts';
import {$} from './dom.ts';
import type {PlacedItem} from './state.ts';
import type {Actions} from './ui.ts';
import type {PresetName} from './layout.ts';
import type {ExportMeta} from './usd-export.ts';
import type {EntryProps, FeedField, Layout, Pos} from './types.ts';

// ---------- mutations ----------
// Low-level operations only touch state and models; user edits are wrapped in edit(), and recorded in undo history only if the layout actually changed
const undoStack = createHistory();   // Not named history, to avoid shadowing window.history
// extra: {feeds?, phase?}, from the snapshot entry
function place(type: string, x: number, z: number, extra: EntryProps = {}){
  const key = keyOf(x, z);
  if (state.items.has(key) || !CAT[type]) return;
  const it: Omit<PlacedItem, 'mesh'> & {mesh?: PlacedItem['mesh']} = {...extra, type, x, z};
  view.addMesh(key, it);
  state.items.set(key, it as PlacedItem);
}
function remove(key: string){
  const it = state.items.get(key); if (!it) return;
  view.removeMesh(it);
  state.items.delete(key);
  if (state.selected === key) state.selected = null;
}
function clearAll(){
  state.items.forEach(it => view.removeMesh(it));
  state.items.clear(); state.selected = null;
}
function replaceLayout(p: Layout){
  clearAll(); state.utility = p.u;
  p.list.map(toItem).forEach(({type, x, z, ...extra}) => place(type, x, z, extra));
}
function edit(fn: () => void){
  const before = snapshot();
  fn();
  pruneFeeds(state.items, CAT);   // After supply equipment is deleted or replaced, manual assignments pointing at it become invalid
  if (!sameLayout(before, snapshot())){ undoStack.record(before); state.powered = false; }
  changed();
}
const removeItem = (key: string) => edit(() => remove(key));
// Loading a preset, importing a file or opening a share link swaps in a different hall, so the failure drill is cleared; undo and redo keep it (facilities still in their cells stay failed)
const loadLayout = (p: Layout) => edit(() => { state.failed.clear(); state.viewPhase = null; state.phase = 1; replaceLayout(p); });
// Not recorded in undo history: loading at startup, and undo/redo themselves
function showLayout(p: Layout){ replaceLayout(p); state.powered = false; state.rowAnchor = null; changed(); }
function undo(){ if (drag) return; const p = undoStack.undo(snapshot()); if (p) showLayout(p); }
function redo(){ if (drag) return; const p = undoStack.redo(snapshot()); if (p) showLayout(p); }

function select(key: string | null){ state.selected = key; state.assignFrom = null; view.setOutline(); renderInfo(); }
function changed(){
  for (const key of state.failed){ const it = state.items.get(key); if (!it || !canFail(CAT[it.type])) state.failed.delete(key); }
  if (state.assignFrom && !feedOf(state.items.get(state.assignFrom))) state.assignFrom = null;
  // Phase selection is capped at "current max phase + 1"; if the viewed phase no longer exists, go back to all
  const phases = phasesIn([...state.items.values()]), maxPhase = phases.at(-1) || 1;
  state.phase = Math.min(state.phase, maxPhase + 1);
  if (state.viewPhase !== null && state.viewPhase >= maxPhase) state.viewPhase = null;
  buildUI(); view.rebuildLinks(); view.setOutline(); refresh(); updateGhost();
  saveLayout(snapshot()); updateShareLink();
  $<HTMLButtonElement>('#undo').disabled = !undoStack.canUndo;
  $<HTMLButtonElement>('#redo').disabled = !undoStack.canRedo;
}

// ---------- placement preview ----------
// Single placement previews the empty cell under the mouse; in row placement, once the first cell is clicked, the preview spans from it to the mouse (touch has no hover, so only the first cell shows)
let hoverCell: Pos | null = null;
function updateGhost(){
  let cells: Pos[] = [];
  if (state.tool){
    const end = hoverCell || state.rowAnchor;
    if (state.placeMode === 'row' && state.rowAnchor) cells = lineCells(state.rowAnchor, end || state.rowAnchor);
    else if (end) cells = [end];
  }
  view.setGhost(freeCells(cells, state.items), state.tool);
}

// ---------- drag to move ----------
// Dragging onto an empty cell moves the device immediately (links and capacity checks update), occupied cells are skipped; on release the whole drag becomes one undo entry.
// When grabbing a device by its side, the floor under the pointer is a cell behind it, so move by how many cells the pointer moved rather than to the cell under the pointer
let drag: {key: string; before: Layout; moved: boolean; origin: Pos; grab: Pos} | null = null;
const dragItem: DragHandlers = {
  start(e){
    const key = view.pickItem(e);
    const it = key && state.items.get(key);
    if (!key || !it) return false;
    const origin = {x: it.x, z: it.z};
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
    if (!it) return;
    state.items.delete(drag.key);
    retargetFeeds(state.items, it, c);   // When moving supply equipment, devices manually connected to it follow
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
// Marking failures does not change the layout: no undo entry, no power-off, just recompute links and capacity checks
function toggleFailed(key: string){
  const it = state.items.get(key);
  if (!it || !canFail(CAT[it.type])) return;
  if (!state.failed.delete(key)) state.failed.add(key);
  view.rebuildLinks(); refresh();
}
function restoreAll(){ state.failed.clear(); view.rebuildLinks(); refresh(); }

// ---------- growth plan ----------
// New devices go into the selected phase; if an earlier phase is being viewed, switch back to all so the placed device does not disappear
function newProps(){
  if (state.viewPhase !== null && state.phase > state.viewPhase) state.viewPhase = null;
  return state.phase > 1 ? {phase: state.phase} : {};
}
function setItemPhase(key: string, phase: number){
  const it = state.items.get(key);
  if (!it) return;
  edit(() => { if (phase > 1) it.phase = phase; else delete it.phase; });
}
// View state does not change the layout: no undo entry, just recompute
function setView(fn: () => void){ fn(); view.rebuildLinks(); refresh(); buildUI(); }

// ---------- manual supply assignment ----------
// Supply equipment type → field on the device
const feedOf = (it: {type: string} | undefined): FeedField | null =>
  it?.type === FEEDS.coolantSource.type ? 'coolantSource' : it?.type === FEEDS.powerFeed.type ? 'powerFeed' : null;
// Detail panel dropdown: value is 'auto' (nearest) or 'x,z'
function setFeedChoice(key: string, field: FeedField, value: string){
  const it = state.items.get(key);
  if (!it) return;
  const [x, z] = value.split(',').map(Number);
  edit(() => setFeed(it, field, value === 'auto' ? null : {x, z}));
}
// Assign mode: with a CDU / RPP selected, click a device to connect it; clicking one already manually connected to it reverts it to nearest
function toggleAssignMode(key: string){
  state.assignFrom = state.assignFrom === key || !feedOf(state.items.get(key)) ? null : key;
  renderInfo();
}
function assignTap(key: string){
  const src = state.assignFrom ? state.items.get(state.assignFrom) : undefined, it = state.items.get(key);
  const field = feedOf(src);
  if (!src || !it || !field || !FEEDS[field].needs(CAT[it.type])) return;
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
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
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
// Every change writes the layout into the URL hash; replaceState adds no history entry and does not fire hashchange.
// Also reset the share section's message to the default hint; later load or copy results overwrite it
function updateShareLink(){
  $('#shareMsg').textContent = tr('shareHint');
  $('#shareWarnings').replaceChildren();
  const hash = encodeLayout(snapshot());
  try { history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search); } catch (e) {}   // May be disallowed in the claude.ai sandbox
}

// Load when a link with a layout is opened or pasted. Returns whether the link's layout was loaded. record: whether to add to undo history (not at startup)
function loadFromLink(record: boolean): boolean{
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

function tap(e: PointerEvent){
  // Assign mode: clicking a device toggles its connection, clicking this supply device itself exits, clicking empty floor does nothing
  if (state.assignFrom){
    const key = view.pickItem(e);
    if (key === state.assignFrom){ state.assignFrom = null; renderInfo(); }
    else if (key) assignTap(key);
    return;
  }
  // Row placement: the first click sets the start, the second fills empty cells along the line with the current device
  if (state.tool && state.placeMode === 'row'){
    const c = view.pickCell(e);
    if (!c) return;
    if (!state.rowAnchor){ state.rowAnchor = c; state.selected = null; view.setOutline(); buildUI(); renderInfo(); updateGhost(); return; }
    const cells = freeCells(lineCells(state.rowAnchor, c), state.items);
    state.rowAnchor = null;
    const tool = state.tool;
    edit(() => cells.forEach(p => place(tool, p.x, p.z, newProps())));
    return;
  }
  const key = view.pickItem(e);
  if (key){ select(key); return; }
  const c = view.pickCell(e);
  const tool = state.tool;
  if (c && tool && !state.items.has(keyOf(c.x, c.z))){ edit(() => place(tool, c.x, c.z, newProps())); return; }
  select(null);
}

// ---------- export ----------
// Import replaces the current hall; at most MAX_WARNINGS warnings are listed
const MAX_WARNINGS = 8;
function showImportResult(msg: HTMLElement, list: HTMLElement, text: string, warnings: string[] = []){
  msg.textContent = text;
  const lines = warnings.slice(0, MAX_WARNINGS);
  if (warnings.length > MAX_WARNINGS) lines.push(tr('moreMessages', {n: warnings.length - MAX_WARNINGS}));
  // Warnings contain prim names from the file; write them with textContent, never as HTML
  list.replaceChildren(...lines.map(txt => Object.assign(document.createElement('li'), {className: 'warn', textContent: txt})));
}

function initImport(msg: HTMLElement){
  const input = $<HTMLInputElement>('#usdFile'), list = $('#usdWarnings');
  $('#usdImport').onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';                                   // Allow selecting the same file again
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
  const box = $('#usdBox'), msg = $('#usdMsg'), btn = $<HTMLButtonElement>('#usdExport');
  exportHint = () => saver.hint() + tr('usdHint');
  msg.textContent = exportHint();
  box.hidden = false;
  initImport(msg);
  // Shared by both exports: the OpenUSD layer, and layout.json for the Unity version (format in spec/layout.schema.json)
  const exportWith = (button: HTMLButtonElement, filename: string, build: (meta: ExportMeta) => string, done: () => string) => {
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
        const code = (e as {code?: string} | null)?.code;
        if (code === 'declined') msg.textContent = tr('exportCancelled');
        else if (code === 'rate_limited') msg.textContent = tr('exportBusy');
        else msg.textContent = tr('exportFailed');
      } finally { button.disabled = false; }
    };
  };
  exportWith(btn, 'datahall.usda', meta => buildUsda(itemList(), CAT, state.utility, GRID, meta),
    () => tr('exportUsdDone', {n: state.items.size}));
  exportWith($<HTMLButtonElement>('#layoutExport'), 'layout.json', meta => layoutToText(buildLayout(itemList(), CAT, state.utility, GRID, meta)),
    () => tr('exportLayoutDone', {n: state.items.size}));
}

// ---------- language ----------
// English by default; the choice is stored in localStorage. ?lang=zh selects directly (not written into the share link hash)
const LANG_KEY = 'datahall.lang';
function initialLang(): string{
  const fromQuery = new URLSearchParams(location.search).get('lang');
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
  return fromQuery || saved || DEFAULT_LANG;
}
function applyLang(id: string, persist: boolean){
  setLang(id);
  if (persist) try { localStorage.setItem(LANG_KEY, id); } catch (e) {}
  document.documentElement.lang = htmlLang();
  applyStaticText();
}
// Redraw panels after switching; replace the last result messages in the share and export sections with the default hint in the current language
function switchLang(id: string){
  applyLang(id, true);
  buildUI(); refresh(); updateShareLink();
  $('#usdMsg').textContent = exportHint();
  $('#usdWarnings').replaceChildren();
}

// ---------- boot ----------
// Before anything writes the current layout into the hash
const openedFromShareLink = hasShareLink(location.hash);
applyLang(initialLang(), false);
const el = view.initScene($('#stage'));
initControls(el, view.camera, {
  onTap: tap,
  onHover: e => { hoverCell = view.pickCell(e); updateGhost(); },
  onLeave: () => { hoverCell = null; updateGhost(); },
  resetButton: $('#camReset'),
  drag: dragItem,
});
const actions: Actions = {
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
};
initUI(actions);
initExport();
initShare();
initKeyboard();

const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener?.('change', () => { view.retheme(); refresh(); });

if (!loadFromLink(false)) showLayout(restoreLayout() || PRESETS.gb200);
// For browser automation tests on the dev server
if (import.meta.env.DEV) (window as unknown as {__datahall: object}).__datahall = {state, cellToScreen: view.cellToScreen, visibleGhosts: view.visibleGhosts, renderOnce: view.renderOnce};
view.startLoop();
initAnalytics(openedFromShareLink);
