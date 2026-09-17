// Right-side panel: utility selection, device palette, capacity gauges, issue list, power button, details
import {CATALOG, CAT} from './catalog.ts';
import {compute, fmt} from './sim.ts';
import {supplyLoads, supplyIssues} from './supply.ts';
import {keyOf, nearest, FEEDS} from './grid.ts';
import {canFail, singlePointsOfFailure} from './redundancy.ts';
import {state, itemList, isActive, inView} from './state.ts';
import {phasesIn, growthPlan, headroom} from './growth.ts';
import {LANGS, getLang, tr, loc, catName, catNote} from './i18n.ts';
import type {MessageKey, Messages} from './i18n.ts';
import {$, setHTML} from './dom.ts';
import type {Loads, Supply} from './supply.ts';
import type {Links} from './grid.ts';
import type {Reason, ReasonKind} from './redundancy.ts';
import type {PresetName} from './layout.ts';
import type {CatalogItem, FeedField, Item} from './types.ts';

// Actions triggered by the panel, implemented in main.ts
export interface Actions {
  removeItem(key: string): void;
  setUtility(u: number): void;
  setTool(id: string): void;
  setPlaceMode(mode: 'one' | 'row'): void;
  togglePower(): void;
  loadPreset(name: PresetName): void;
  showAlerts(keys: Set<string>): void;
  toggleFailed(key: string): void;
  setPlacePhase(n: number): void;
  setViewPhase(n: number | null): void;
  setHeadroomType(type: string): void;
  setItemPhase(key: string, phase: number): void;
  setFeedChoice(key: string, field: FeedField, value: string): void;
  toggleAssignMode(key: string): void;
  restoreAll(): void;
  setLang(id: string): void;
}

// Supply info for the detail panel: the device, its load as a CDU / RPP, and the supply equipment it connects to
interface SupplyInfo {item: Item; supply: Supply | undefined; links: Links<Item> | undefined; loads: Loads; active: Item[]}

const UTIL = [2, 5, 10];
let actions: Actions;
let supplyByKey = new Map<string, SupplyInfo>();

// Click event delegation: find the button with data-*
const closest = (e: Event, selector: string): HTMLElement | null => e.target instanceof Element ? e.target.closest<HTMLElement>(selector) : null;

export function initUI(a: Actions): void{
  actions = a;
  $('#utility').onclick = e => { const b = closest(e, 'button'); if (b) actions.setUtility(Number(b.dataset.u)); };
  $('#palette').onclick = e => { const b = closest(e, 'button'); if (b?.dataset.t) actions.setTool(b.dataset.t); };
  $('#placeMode').onclick = e => { const b = closest(e, 'button'); if (b) actions.setPlaceMode(b.dataset.mode === 'row' ? 'row' : 'one'); };
  $('#power').onclick = () => actions.togglePower();
  $('#lang').onclick = e => { const b = closest(e, 'button'); if (b?.dataset.lang) actions.setLang(b.dataset.lang); };
  $('#drillRestoreAll').onclick = () => actions.restoreAll();
  $('#placePhase').onclick = e => { const b = closest(e, 'button'); if (b) actions.setPlacePhase(Number(b.dataset.phase)); };
  $('#viewPhase').onclick = e => { const b = closest(e, 'button'); if (b) actions.setViewPhase(b.dataset.phase === 'all' ? null : Number(b.dataset.phase)); };
  $('#growth').onclick = e => { const r = closest(e, 'tr[data-phase]'); if (r){ const n = Number(r.dataset.phase); actions.setViewPhase(state.viewPhase === n ? null : n); } };
  $('#growth').onkeydown = e => {
    const r = closest(e, 'tr[data-phase]');
    if (r && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); r.click(); }
  };
  $('#growth').onchange = e => { if (e.target instanceof HTMLSelectElement && e.target.id === 'headroomType') actions.setHeadroomType(e.target.value); };
  document.querySelectorAll<HTMLElement>('[data-preset]').forEach(b => { b.onclick = () => actions.loadPreset(b.dataset.preset as PresetName); });
}

// Static copy in index.html marked with data-i18n, plus the language switch buttons
// Keys of plain-text messages (no variables)
type TextKey = {[K in MessageKey]: Messages[K] extends string ? K : never}[MessageKey];
export function applyStaticText(): void{
  // data-i18n holds keys of plain-text messages (no variables)
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n as TextKey); });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', tr(el.dataset.i18nAria as TextKey)));
  setHTML($('#lang'), LANGS.map(l =>
    `<button type="button" data-lang="${l.id}" lang="${l.html}" aria-pressed="${l.id === getLang()}">${l.label}</button>`).join(''));
}

export function buildUI(): void{
  // Phase buttons: existing phases plus a "next phase" one
  const phases = phasesIn([...state.items.values()]), next = (phases.at(-1) || 1) + 1;
  setHTML($('#placePhase'), [...new Set([...phases, 1, state.phase])].sort((a, b) => a - b).concat(state.phase === next ? [] : [next]).map(n =>
    `<button type="button" data-phase="${n}" aria-pressed="${state.phase === n}"${n === next && !phases.includes(n) && state.phase !== n ? ` aria-label="${tr('phaseNew')}"` : ''}>${n === next && !phases.includes(n) && state.phase !== n ? '+' : n}</button>`).join(''));
  setHTML($('#viewPhase'), ([['all', tr('viewAll')], ...phases.slice(0, -1).map(n => [n, n])] as [number | 'all', string | number][]).map(([v, label]) =>
    `<button type="button" data-phase="${v}" aria-pressed="${v === 'all' ? state.viewPhase === null : state.viewPhase === v}">${label}</button>`).join(''));
  $('#viewPhaseRow').hidden = phases.length < 2;
  setHTML($('#placeMode'), ([['one', 'placeOne'], ['row', 'placeRow']] as const).map(([mode, key]) =>
    `<button type="button" data-mode="${mode}" aria-pressed="${state.placeMode === mode}">${tr(key)}</button>`).join(''));
  const hint = state.placeMode !== 'row' ? '' : !state.tool ? tr('rowHintTool') : tr(state.rowAnchor ? 'rowHintEnd' : 'rowHintStart');
  $('#placeHint').textContent = hint;
  $('#placeHint').hidden = !hint;
  setHTML($('#utility'), UTIL.map(u => `<button type="button" data-u="${u}" aria-pressed="${u === state.utility}">${u} MW</button>`).join(''));
  setHTML($('#palette'), CATALOG.map(t => {
    const bits = [t.kw ? t.kw + ' kW' : '', t.gpus ? t.gpus + ' GPU' : '', t.liqCool ? tr('chipCooling', {kw: t.liqCool}) : '',
      t.airCool ? tr('chipCooling', {kw: t.airCool}) : '', t.dist ? tr('chipDist', {kw: t.dist}) : '', t.ports ? tr('chipPorts', {n: t.ports}) : ''].filter(Boolean).join(tr('listSep'));
    return `<button type="button" class="chip" data-t="${t.id}" aria-pressed="${state.tool === t.id}">
      <i style="background:var(${t.c})"></i><div><strong>${catName(t)}</strong><small>${bits}</small></div></button>`;
  }).join(''));
}

function gauge(label: string, v: number, cap: number, cssVar: string): string{
  const pct = cap ? Math.min(100, v / cap * 100) : (v ? 100 : 0);
  const over = v > cap;
  return `<div class="gauge"><div class="top"><span>${label}</span><em style="color:${over ? 'var(--bad)' : 'inherit'}">${fmt(v)} / ${fmt(cap)}</em></div>
    <div class="bar"><i style="width:${pct}%;background:var(${over ? '--bad' : cssVar})"></i></div></div>`;
}

export function refresh(): void{
  // Facilities marked failed in the failure drill are excluded from computation
  const all = itemList();
  const list = all.filter(it => isActive(keyOf(it.x, it.z), it));
  const planned = all.filter(inView);   // Devices within the currently viewed phase (regardless of the failure drill)
  const s = compute(list, CAT, state.utility);
  const loads = supplyLoads(list, CAT);
  const perDevice = supplyIssues(loads, s);
  const blocking = s.blocking || perDevice.some(i => i.lvl === 'bad');
  supplyByKey = new Map(list.map(it => [keyOf(it.x, it.z), {item: it, supply: loads.supplies.get(it), links: loads.links.get(it), loads, active: list}]));
  const alerts = new Set([...loads.supplies].filter(([, v]) => v.overloaded).map(([it]) => keyOf(it.x, it.z)));
  loads.unconnected.forEach(u => alerts.add(keyOf(u.item.x, u.item.z)));
  actions.showAlerts(alerts);
  $('#hGpu').textContent = s.gpus.toLocaleString();
  $('#hIt').textContent = fmt(s.it);
  $('#hPue').textContent = s.it ? s.pue.toFixed(2) : '–';
  setHTML($('#gauges'),
    gauge(tr('gaugeDist'), s.it, s.dist, '--copper') +
    gauge(tr('gaugeLiquid'), s.liqHeat, s.liqCap, '--coolant') +
    gauge(tr('gaugeAir'), s.airHeat, s.airCap, '--air') +
    `<div class="gauge"><div class="top"><span>${tr('gaugeNetwork')}</span><em style="color:${s.gpus > s.ports ? 'var(--bad)' : 'inherit'}">${tr('ports', {used: s.gpus, total: s.ports})}</em></div>
      <div class="bar"><i style="width:${s.ports ? Math.min(100, s.gpus / s.ports * 100) : (s.gpus ? 100 : 0)}%;background:var(${s.gpus > s.ports ? '--bad' : '--net'})"></i></div></div>` +
    gauge(tr('gaugeUtility'), s.facility, state.utility * 1000, '--ink') +
    `<div class="gauge"><div class="top"><span>${tr('gaugeCapex')}</span><em>${tr('capex', {m: s.capex.toFixed(1)})}</em></div></div>`);
  // Hall-wide total checks first, per-device overloads after
  const drill: {lvl: string; txt: string}[] = [
    ...(state.viewPhase !== null ? [{lvl: 'warn', txt: tr('viewIssues', {n: state.viewPhase})}] : []),
    ...(state.failed.size ? [{lvl: 'warn', txt: tr('drillIssues', {n: state.failed.size})}] : []),
  ];
  let html = [...drill, ...s.issues, ...perDevice].map(i => `<li class="${i.lvl}">${i.txt}</li>`).join('');
  if (!s.it) html = `<li class="warn">${tr('issueEmpty')}</li>`;
  else if (!blocking) html += `<li class="ok">${tr('issueOk')}</li>`;
  setHTML($('#issues'), html);
  const btn = $<HTMLButtonElement>('#power');
  btn.disabled = !s.it || (blocking && !state.powered);   // If the drill causes problems after power-on, powering off is still allowed
  btn.classList.toggle('on', state.powered);
  btn.textContent = tr(state.powered ? 'powerOff' : 'powerOn');
  renderDrill(planned);
  renderGrowth(all, planned);
  renderInfo();
}

// Reasons for failing the capacity check (blockingReasons in redundancy.ts) as short phrases
const REASON_TEXT = {dist: 'reasonDist', liquid: 'reasonLiquid', air: 'reasonAir', network: 'reasonNetwork', utility: 'reasonUtility'} as const;
function reasonText(r: Reason): string{
  if (r.kind === 'overload') return tr('reasonOverload', {label: r.item.type.toUpperCase(), loc: loc(r.item.x, r.item.z)});
  return tr(REASON_TEXT[r.kind]);
}

// Failure drill section: current failure count, and the N+1 check of the whole layout ignoring the drill
const MAX_SPOF = 5;
function renderDrill(all: Item[]): void{
  $('#drillBar').hidden = !state.failed.size;
  $('#drillStatus').textContent = tr('drillActive', {n: state.failed.size});
  let html = '';
  if (all.some(i => canFail(CAT[i.type]))){
    const spof = singlePointsOfFailure(all, CAT, state.utility);
    if (spof === null) html = `<li class="warn">${tr('n1Blocked')}</li>`;
    else if (!spof.length) html = `<li class="ok">${tr('n1Ok')}</li>`;
    else {
      html = `<li class="warn">${tr('n1Bad', {n: spof.length})}</li>` + spof.slice(0, MAX_SPOF).map(r =>
        `<li class="warn">${tr('n1Item', {name: catName(CAT[r.item.type]), loc: loc(r.item.x, r.item.z), reasons: r.reasons.map(reasonText).join(tr('listSep'))})}</li>`).join('');
      if (spof.length > MAX_SPOF) html += `<li class="warn">${tr('moreMessages', {n: spof.length - MAX_SPOF})}</li>`;
    }
  }
  setHTML($('#n1'), html);
}

// Growth planning section: cumulative per-phase table, and headroom after the currently viewed phase
const KIND_LABEL = {dist: 'gaugeDist', liquid: 'gaugeLiquid', air: 'gaugeAir', network: 'gaugeNetwork', utility: 'gaugeUtility'} as const satisfies Record<ReasonKind, MessageKey>;
const pct = (r: number): string => r === Infinity ? '∞' : Math.round(r * 100) + '%';
function renderGrowth(all: Item[], planned: Item[]): void{
  const plan = growthPlan(all, CAT, state.utility);
  if (!plan.length){ setHTML($('#growth'), ''); return; }
  const rows = plan.map(p => {
    const ok = !p.reasons.length, current = state.viewPhase === p.phase || (state.viewPhase === null && p === plan.at(-1));
    return `<tr data-phase="${p.phase}" class="${current ? 'current' : ''}" tabindex="0">
      <td>${p.phase}</td><td>${p.gpus.toLocaleString()}</td><td>${fmt(p.itKw)}</td>
      <td>${tr(KIND_LABEL[p.tightest.kind])} ${pct(p.tightest.ratio)}</td>
      <td style="color:var(${ok ? '--ok' : '--bad'})">${tr(ok ? 'statusOk' : 'statusFail')}</td></tr>`;
  }).join('');
  const fails = plan.filter(p => p.reasons.length).map(p =>
    `<li class="bad">${tr('growthFail', {n: p.phase, reasons: p.reasons.map(reasonText).join(tr('listSep'))})}</li>`).join('');
  // Headroom: defaults to the most common GPU rack type in the layout
  const gpuTypes = CATALOG.filter(t => t.gpus);
  const counts = new Map<string, number>(); planned.forEach(i => { if (CAT[i.type].gpus) counts.set(i.type, (counts.get(i.type) || 0) + 1); });
  const type = state.headroomType || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'vr200';
  const room = headroom(planned, CAT, state.utility, type);
  const asOf = state.viewPhase ?? plan[plan.length - 1].phase;
  const roomText = tr('headroom', {phase: asOf, n: room.count === Infinity ? '∞' : room.count,
    limit: room.limit ? tr(KIND_LABEL[room.limit]).toLowerCase() : '–'});
  setHTML($('#growth'), `<table class="growth">
      <thead><tr><th>${tr('colPhase')}</th><th>GPU</th><th>${tr('hudIt')}</th><th>${tr('colTightest')}</th><th>${tr('colStatus')}</th></tr></thead>
      <tbody>${rows}</tbody></table>
    ${fails ? `<ul class="issues">${fails}</ul>` : ''}
    <p class="room"><select id="headroomType" aria-label="${tr('headroomType')}">${gpuTypes.map(t =>
      `<option value="${t.id}"${t.id === type ? ' selected' : ''}>${catName(t)}</option>`).join('')}</select> ${roomText}</p>
    <p class="sub">${tr('headroomNote')}</p>`);
}

const badText = (txt: string): string => `<span style="color:var(--bad)">${txt}</span>`;

// Supply relations in the detail panel: CDUs and RPPs show their load, other devices show which unit supplies their coolant and power
type Row = [string, string | number];
function supplyRows(t: CatalogItem, info: SupplyInfo | undefined): Row[]{
  if (!info) return [];
  const rows: Row[] = [];
  if (info.supply){
    const {loadKw, capacityKw, consumers, overloaded} = info.supply;
    const text = `${fmt(loadKw)} / ${fmt(capacityKw)}`;
    rows.push([tr('rowLoad'), overloaded ? badText(text + tr('overloadedSuffix')) : text], [tr('rowConsumers'), tr('deviceCount', {n: consumers.length})]);
  }
  // Devices: a dropdown picks the supply; the first option is nearest (the current nearest unit in parentheses); if the manually assigned unit is removed (failure drill), the actual connection is the nearest
  const source = (field: FeedField, label: string, row: 'rowCoolantFrom' | 'rowPowerFrom', needed: boolean) => {
    if (!needed) return;
    const s = info.links?.[field];
    const all = [...state.items.values()].filter(i => i.type === FEEDS[field].type);
    if (!all.length){ rows.push([tr(row), badText(tr('noSupply', {label}))]); return; }
    const it = info.item, want = it.feeds?.[field];
    const near = nearest(it, info.active.filter(i => i.type === FEEDS[field].type))?.a;
    const loadOf = (i: Item) => { const a = info.active.find(a => a.x === i.x && a.z === i.z), sup = a && info.loads.supplies.get(a); return sup ? `${fmt(sup.loadKw)} / ${fmt(sup.capacityKw)}` : tr('statusFailed'); };
    const options = [`<option value="auto">${tr('feedNearest', {source: near ? tr('supplyAt', {label, loc: loc(near.x, near.z)}) : tr('feedNone')})}</option>`,
      ...all.sort((a, b) => Math.hypot(a.x - it.x, (a.z - it.z) * 2) - Math.hypot(b.x - it.x, (b.z - it.z) * 2)).map(i => {
        const v = `${i.x},${i.z}`, chosen = want && want[0] === i.x && want[1] === i.z;
        return `<option value="${v}"${chosen ? ' selected' : ''}>${tr('supplyAt', {label, loc: loc(i.x, i.z)})} · ${loadOf(i)}</option>`;
      })];
    const warn = s && info.loads.supplies.get(s)?.overloaded ? `<div>${badText(tr('supplyAt', {label, loc: loc(s.x, s.z)}) + tr('overloadedSuffix'))}</div>` : '';
    rows.push([tr(row), `<select data-feed="${field}" aria-label="${tr(row)}">${options.join('')}</select>${warn}`]);
  };
  source('coolantSource', 'CDU', 'rowCoolantFrom', (t.kw || 0) > 0 && (t.liq || 0) > 0);
  source('powerFeed', 'RPP', 'rowPowerFrom', (t.kw || 0) > 0);
  return rows;
}

export function renderInfo(): void{
  const box = $('#info');
  const key = state.selected, it = key ? state.items.get(key) : undefined;
  const t = it ? CAT[it.type] : state.tool ? CAT[state.tool] : null;
  if (!t){ setHTML(box, tr('infoEmpty')); return; }
  const rows: Row[] = [];
  if (t.kw) rows.push([tr('rowPower'), t.kw + ' kW']);
  if (t.gpus) rows.push([tr('rowGpu'), t.gpus]);
  if (t.kw) rows.push([tr('rowCooling'), t.liq ? tr('liquidPct', {pct: Math.round(t.liq * 100)}) : tr('air')]);
  if (t.liqCool) rows.push([tr('rowLiquidCap'), t.liqCool + ' kW']);
  if (t.airCool) rows.push([tr('rowAirCap'), t.airCool + ' kW']);
  if (t.dist) rows.push([tr('rowDistCap'), t.dist + ' kW']);
  if (t.ports) rows.push([tr('rowPorts'), t.ports]);
  rows.push([tr('rowPrice'), '$' + t.cap + 'M']);
  const failable = !!it && canFail(t), failed = failable && !!key && state.failed.has(key);
  const supplyType = !!it && (it.type === 'cdu' || it.type === 'rpp'), assigning = supplyType && state.assignFrom === key;
  if (it && supplyType){
    const field: FeedField = it.type === 'cdu' ? 'coolantSource' : 'powerFeed';
    const manual = [...state.items.values()].filter(i => { const c = i.feeds?.[field]; return !!c && c[0] === it.x && c[1] === it.z; }).length;
    if (manual) rows.push([tr('rowManual'), tr('deviceCount', {n: manual})]);
  }
  if (failed) rows.push([tr('rowStatus'), badText(tr('statusFailed'))]);
  if (it){
    const maxPhase = phasesIn([...state.items.values()]).at(-1) || 1, cur = it.phase || 1;
    rows.push([tr('rowPhase'), `<select id="itemPhase" aria-label="${tr('rowPhase')}">${Array.from({length: maxPhase + 1}, (_, i) => i + 1).map(n =>
      `<option value="${n}"${n === cur ? ' selected' : ''}>${tr('phaseN', {n})}</option>`).join('')}</select>`]);
  }
  if (it) rows.push(...supplyRows(t, supplyByKey.get(keyOf(it.x, it.z))));
  const at = it ? tr('infoAt', {x: it.x + 1, z: it.z + 1, loc: loc(it.x, it.z)}) : tr('infoPlaceHint');
  setHTML(box, `<strong>${catName(t)}</strong><span style="color:var(--muted)">${at}</span>
    <table>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    ${it && assigning ? `<p class="assign-hint">${tr('assignHint', {label: it.type.toUpperCase()})}</p>` : ''}
    <p>${catNote(t)}</p>
    ${it ? `<div class="row" style="margin-top:8px">${supplyType ? `<button type="button" id="assignToggle" aria-pressed="${assigning}">${tr(assigning ? 'assignDone' : 'assignStart')}</button>` : ''}${failable ? `<button type="button" id="failToggle" title="F" aria-keyshortcuts="F">${tr(failed ? 'drillRestore' : 'drillFail')}</button>` : ''}<button type="button" id="del">${tr('remove')}</button></div>` : ''}`);
  if (!key) return;
  // These controls exist only when a placed device is selected
  const q = <T extends HTMLElement>(s: string) => box.querySelector<T>(s);
  const d = q('#del'); if (d) d.onclick = () => actions.removeItem(key);
  const f = q('#failToggle'); if (f) f.onclick = () => actions.toggleFailed(key);
  const a = q('#assignToggle'); if (a) a.onclick = () => actions.toggleAssignMode(key);
  const ph = q<HTMLSelectElement>('#itemPhase'); if (ph) ph.onchange = () => actions.setItemPhase(key, Number(ph.value));
  box.querySelectorAll<HTMLSelectElement>('select[data-feed]').forEach(sel => { sel.onchange = () => actions.setFeedChoice(key, sel.dataset.feed as FeedField, sel.value); });
}
