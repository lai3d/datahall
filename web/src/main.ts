import {CAT} from './catalog.ts';
import {GRID, keyOf, FEEDS} from './grid.ts';
import {phasesIn, MAX_PHASE} from './growth.ts';
import {setFeed, pruneFeeds, retargetFeeds} from './feeds.ts';
import {state, itemList, snapshot} from './state.ts';
import * as view from './scene.ts';
import {initControls} from './controls.ts';
import type {DragHandlers} from './controls.ts';
import {mountUI} from './ui.tsx';
import {notify} from './store.ts';
import {hallModel} from './model.ts';
import {PRESETS, saveLayout, restoreLayout} from './layout.ts';
import {buildUsda} from './usd-export.ts';
import {importUsda, UsdImportError} from './usd-import.ts';
import {buildLayout, layoutToText} from './layout-export.ts';
import {createSaver} from './download.ts';
import type {Saver} from './download.ts';
import {encodeLayout, decodeLayout} from './share-link.ts';
import {DEFAULT_LANG, setLang, htmlLang, tr} from './i18n.ts';
import {lineCells, freeCells, sameLayout, createHistory, toItem} from './edit.ts';
import {canFail, blockingReasons} from './redundancy.ts';
import {advance, LAST} from './tutorial.ts';
import type {TutorialContext} from './tutorial.ts';
import {hasShareLink, initAnalytics, reportTutorialDone} from './analytics.ts';
import {$} from './dom.ts';
import type {PlacedItem} from './state.ts';
import type {Actions} from './ui.tsx';
import type {Notice} from './state.ts';
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
// They also end a running tutorial
const loadLayout = (p: Layout) => edit(() => { state.failed.clear(); state.viewPhase = null; state.phase = 1; state.tutorial = null; replaceLayout(p); });
// Not recorded in undo history: loading at startup, and undo/redo themselves
function showLayout(p: Layout){ replaceLayout(p); state.powered = false; state.rowAnchor = null; changed(); }
function undo(){ if (drag) return; const p = undoStack.undo(snapshot()); if (p) showLayout(p); }
function redo(){ if (drag) return; const p = undoStack.redo(snapshot()); if (p) showLayout(p); }

function select(key: string | null){ state.selected = key; state.assignFrom = null; view.setOutline(); notify(); }
// Sync the 3D scene's alert caps and dimming with the current model, then re-render the panel
function refresh(){
  const model = hallModel();
  view.setAlerts(model.alerts);
  view.setLoads(model.loads);
  view.setDimmed();
  if (state.tutorial !== null) stepTutorial(model, false);
  notify();
}

// ---------- tutorial ----------
const TUTORIAL_SEEN = 'datahall.tutorial.seen';
function tutorialSeen(): boolean{ try { return localStorage.getItem(TUTORIAL_SEEN) === '1'; } catch (e) { return false; } }
function markTutorialSeen(){ try { localStorage.setItem(TUTORIAL_SEEN, '1'); } catch (e) {} state.ui.tutorialOffer = false; }

function tutorialContext(model: ReturnType<typeof hallModel>): TutorialContext{
  const counts: Record<string, number> = {};
  for (const it of model.all) counts[it.type] = (counts[it.type] || 0) + 1;
  const reasons = blockingReasons(model.active, CAT, state.utility);
  return {
    tool: state.tool, counts, blocking: model.blocking, powered: state.powered,
    reasons: reasons.flatMap(r => r.kind === 'overload' ? [] : [r.kind]),
    overloads: reasons.flatMap(r => r.kind === 'overload' && (r.item.type === 'cdu' || r.item.type === 'rpp') ? [r.item.type] : []),
  };
}
// Advance the running tutorial on the current hall; `next` is the "Next" button on manual steps
function stepTutorial(model: ReturnType<typeof hallModel>, next: boolean){
  if (state.tutorial === null) return;
  const before = state.tutorial;
  state.tutorial = advance(before, tutorialContext(model), next);
  if (before < LAST && state.tutorial === LAST) reportTutorialDone();
}
// Start from an empty hall at 2 MW with nothing selected
function startTutorial(){
  markTutorialSeen();
  loadLayout(PRESETS.empty);
  Object.assign(state, {tool: null, selected: null, placeMode: 'one', rowAnchor: null, assignFrom: null, powered: false, tutorial: 0});
  view.setOutline(); updateGhost();
  refresh();
}
function changed(){
  for (const key of state.failed){ const it = state.items.get(key); if (!it || !canFail(CAT[it.type])) state.failed.delete(key); }
  if (state.assignFrom && !feedOf(state.items.get(state.assignFrom))) state.assignFrom = null;
  // Phase selection is capped at "current max phase + 1"; if the viewed phase no longer exists, go back to all
  const phases = phasesIn([...state.items.values()]), maxPhase = phases.at(-1) || 1;
  state.phase = Math.min(state.phase, maxPhase + 1, MAX_PHASE);
  if (state.viewPhase !== null && state.viewPhase >= maxPhase) state.viewPhase = null;
  view.rebuildLinks(); view.setOutline(); updateGhost();
  saveLayout(snapshot()); updateShareLink();
  state.ui.canUndo = undoStack.canUndo;
  state.ui.canRedo = undoStack.canRedo;
  refresh();
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
  const p = Math.min(Math.max(Math.round(phase), 1), MAX_PHASE);
  edit(() => { if (p > 1) it.phase = p; else delete it.phase; });
}
// View state does not change the layout: no undo entry, just recompute
function setView(fn: () => void){ fn(); view.rebuildLinks(); refresh(); }

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
  notify();
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
  if (state.assignFrom){ state.assignFrom = null; notify(); return; }
  if (state.rowAnchor) state.rowAnchor = null;
  else if (state.tool){ state.tool = null; state.ui.lastPlaced = null; }
  else if (state.selected){ select(null); return; }
  notify(); updateGhost();
}
function initKeyboard(){
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
  state.ui.share = {text: null, warnings: []};
  const hash = encodeLayout(snapshot());
  try { history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search); } catch (e) {}   // May be disallowed in the claude.ai sandbox
}

// Load when a link with a layout is opened or pasted. Returns whether the link's layout was loaded. record: whether to add to undo history (not at startup)
function loadFromLink(record: boolean): boolean{
  const link = decodeLayout(location.hash, CAT, GRID);
  if (!link) return false;
  if (!link.list.length && link.warnings.length){
    showNotice('share', tr('shareNotLoaded'), link.warnings);
    return false;
  }
  (record ? loadLayout : showLayout)(link);
  showNotice('share', tr('shareLoaded', {n: link.list.length, u: link.u}), link.warnings);
  return true;
}

async function copyShareLink(){
  if (!state.items.size){ showNotice('share', tr('shareEmpty')); return; }
  updateShareLink();
  try {
    await navigator.clipboard.writeText(location.href);
    showNotice('share', tr('shareCopied', {n: state.items.size}));
  } catch (e) {
    showNotice('share', tr('shareCopyFailed'));
  }
}

function tap(e: PointerEvent){
  // Assign mode: clicking a device toggles its connection, clicking this supply device itself exits, clicking empty floor does nothing
  if (state.assignFrom){
    const key = view.pickItem(e);
    if (key === state.assignFrom){ state.assignFrom = null; notify(); }
    else if (key) assignTap(key);
    return;
  }
  // Row placement: the first click sets the start, the second fills empty cells along the line with the current device
  if (state.tool && state.placeMode === 'row'){
    const c = view.pickCell(e);
    if (!c) return;
    if (!state.rowAnchor){ state.rowAnchor = c; state.selected = null; view.setOutline(); notify(); updateGhost(); return; }
    const cells = freeCells(lineCells(state.rowAnchor, c), state.items);
    state.rowAnchor = null;
    const tool = state.tool;
    edit(() => cells.forEach(p => place(tool, p.x, p.z, newProps())));
    placedFeedback(e, tool, cells);
    return;
  }
  const key = view.pickItem(e);
  if (key){ select(key); return; }
  const c = view.pickCell(e);
  const tool = state.tool;
  if (c && tool && !state.items.has(keyOf(c.x, c.z))){ edit(() => place(tool, c.x, c.z, newProps())); placedFeedback(e, tool, [c]); return; }
  select(null);
}
// Feedback for a placement tap: the new devices pop up, touch devices get a short vibration where supported,
// and the stage bar (narrow screens) switches to "placed"
function placedFeedback(e: PointerEvent, tool: string, cells: Pos[]){
  const placed = cells.map(p => state.items.get(keyOf(p.x, p.z))).filter(it => it?.type === tool);
  if (!placed.length) return;
  placed.forEach(view.popMesh);
  if (e.pointerType !== 'mouse') try { navigator.vibrate?.(12); } catch (err) {}
  state.ui.lastPlaced = tool;
  notify();
}

// ---------- export ----------
// Status line and warnings under the share or OpenUSD section; the panel lists at most 8 warnings
function showNotice(section: 'share' | 'usd', text: string | null, warnings: string[] = []){
  state.ui[section] = {text, warnings} satisfies Notice;
  notify();
}

// Import replaces the current hall
async function importUsdFile(file: File){
  try {
    const result = importUsda(await file.text(), CAT, GRID);
    loadLayout(result);
    showNotice('usd',
      tr('importDone', {file: file.name, n: result.list.length, u: result.u}) + (result.skipped ? tr('importSkipped', {n: result.skipped}) : ''),
      result.warnings);
  } catch (e) {
    if (!(e instanceof UsdImportError)) console.error(e);
    showNotice('usd', e instanceof UsdImportError ? tr('importFailed', {reason: e.message}) : tr('importReadError'));
  }
}

let saver: Saver | null = null;
const today = () => { const now = new Date(); return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-'); };
const exportHint = () => saver ? saver.hint() + tr('usdHint') : '';
async function initExport(){
  saver = await createSaver();
  state.ui.exportReady = true;
  notify();
}
// Shared by both exports: the OpenUSD layer, and layout.json for the Unity version (format in spec/layout.schema.json)
async function exportWith(filename: string, build: (meta: ExportMeta) => string, done: () => string){
  if (!saver || state.ui.exporting) return;
  if (!state.items.size){ showNotice('usd', tr('exportEmpty')); return; }
  const text = build({date: today()});
  state.ui.exporting = true;
  showNotice('usd', state.ui.usd.text);
  try {
    await saver.save(filename, text);
    showNotice('usd', done());
  } catch (e) {
    const code = (e as {code?: string} | null)?.code;
    showNotice('usd', code === 'declined' ? tr('exportCancelled') : code === 'rate_limited' ? tr('exportBusy') : tr('exportFailed'));
  } finally {
    state.ui.exporting = false;
    notify();
  }
}
const exportUsd = () => exportWith('datahall.usda', meta => buildUsda(itemList(), CAT, state.utility, GRID, meta),
  () => tr('exportUsdDone', {n: state.items.size}));
const exportLayout = () => exportWith('layout.json', meta => layoutToText(buildLayout(itemList(), CAT, state.utility, GRID, meta)),
  () => tr('exportLayoutDone', {n: state.items.size}));

// One-click screenshot of the 3D view; the message goes to the share section, where the button is
async function saveImage(){
  if (!saver || state.ui.exporting) return;
  state.ui.exporting = true;
  notify();
  try {
    const png = await view.snapshotPng();
    if (!png) throw new Error('empty canvas');
    await saver.saveBlob(`datahall-${today()}.png`, png);
    showNotice('share', tr('imageSaved'));
  } catch (e) {
    const code = (e as {code?: string} | null)?.code;
    showNotice('share', code === 'declined' ? tr('exportCancelled') : code === 'rate_limited' ? tr('exportBusy') : tr('imageFailed'));
  } finally {
    state.ui.exporting = false;
    notify();
  }
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
}
// Redraw panels after switching; replace the last result messages in the share and export sections with the default hint in the current language
function switchLang(id: string){
  applyLang(id, true);
  updateShareLink();
  state.ui.usd = {text: null, warnings: []};
  refresh();
}

// ---------- boot ----------
// Before anything writes the current layout into the hash
const openedFromShareLink = hasShareLink(location.hash);
applyLang(initialLang(), false);
const stage = $('#stage');
const el = view.initScene(stage);
const controls = initControls(el, view.camera, {
  onTap: tap,
  onHover: e => { hoverCell = view.pickCell(e); updateGhost(); },
  onLeave: () => { hoverCell = null; updateGhost(); },
  drag: dragItem,
});
const actions: Actions = {
  removeItem,
  togglePanel: () => { state.ui.panelCollapsed = !state.ui.panelCollapsed; notify(); },
  showPanel: () => { state.ui.panelCollapsed = false; notify(); },
  stopPlacing: () => { Object.assign(state, {tool: null, rowAnchor: null}); state.ui.lastPlaced = null; updateGhost(); notify(); },
  setUtility: u => edit(() => { state.utility = u; }),
  setTool(id){ state.tool = state.tool === id ? null : id; state.ui.lastPlaced = null; state.selected = null; state.rowAnchor = null; state.assignFrom = null; view.setOutline(); updateGhost(); refresh(); },
  setPlaceMode(mode){ state.placeMode = mode; state.rowAnchor = null; updateGhost(); refresh(); },
  togglePower(){ state.powered = !state.powered; state.powerStart = performance.now(); view.rebuildLinks(); refresh(); },
  loadPreset: name => loadLayout(PRESETS[name]),
  toggleFailed,
  setPlacePhase: n => setView(() => { n = Math.min(Math.max(n, 1), MAX_PHASE); state.phase = n; if (state.viewPhase !== null && n > state.viewPhase) state.viewPhase = null; }),
  setViewPhase: n => setView(() => { state.viewPhase = n; }),
  setHeadroomType: type => setView(() => { state.headroomType = type; }),
  setItemPhase,
  setFeedChoice,
  toggleAssignMode,
  restoreAll,
  setLang: switchLang,
  startTutorial,
  tutorialNext: () => { stepTutorial(hallModel(), true); refresh(); },
  exitTutorial: () => { state.tutorial = null; notify(); },
  dismissTutorialOffer: () => { markTutorialSeen(); notify(); },
  undo,
  redo,
  resetView: () => controls.resetView(),
  copyShareLink: () => { void copyShareLink(); },
  importUsdFile: file => { void importUsdFile(file); },
  exportUsd: () => { void exportUsd(); },
  exportLayout: () => { void exportLayout(); },
  saveImage: () => { void saveImage(); },
  exportHint,
};
mountUI(actions, stage, $('#panel'));
void initExport();
window.addEventListener('hashchange', () => loadFromLink(true));
initKeyboard();

const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener?.('change', () => { view.retheme(); refresh(); });

// First visit (no share link, nothing saved, tutorial never started or dismissed): offer the tutorial
state.ui.tutorialOffer = !openedFromShareLink && restoreLayout(CAT, GRID) === null && !tutorialSeen();
if (!loadFromLink(false)) showLayout(restoreLayout(CAT, GRID) || PRESETS.gb200);
// Hook for browser automation: dev server and the e2e build (vite build --mode e2e), never in production
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') (window as unknown as {__datahall: object}).__datahall = {state, cellToScreen: view.cellToScreen, visibleGhosts: view.visibleGhosts, renderOnce: view.renderOnce, meters: view.meters, flowDots: view.flowDots};
view.startLoop();
initAnalytics(openedFromShareLink);
