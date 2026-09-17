// Right-side panel and the overlay on the 3D view (HUD, undo / redo, reset view), rendered with React.
// The app logic stays in main.ts: components read `state`, call `actions`, and re-render on notify() (store.ts).
// DOM ids and data-* attributes are part of the contract with the browser smoke tests (e2e/); keep them stable.
import {StrictMode, useEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {CATALOG, CAT} from './catalog.ts';
import {fmt} from './sim.ts';
import {compareRacks} from './compare.ts';
import {annualEnergy, LOAD_RANGE, PRICE_RANGE} from './energy.ts';
import type {EnergyInputs} from './energy.ts';
import {scaleRefs} from './scale.ts';
import {GRID, keyOf, nearest, FEEDS} from './grid.ts';
import {canFail, singlePointsOfFailure} from './redundancy.ts';
import {state} from './state.ts';
import type {Notice} from './state.ts';
import {phasesIn, growthPlan, headroom, MAX_PHASE} from './growth.ts';
import {LANGS, getLang, htmlLang, tr, loc, catName, catNote} from './i18n.ts';
import type {MessageKey} from './i18n.ts';
import {useStateVersion} from './store.ts';
import {hallModel} from './model.ts';
import type {HallModel, SupplyInfo} from './model.ts';
import type {Reason, ReasonKind} from './redundancy.ts';
import type {PresetName} from './layout.ts';
import type {CatalogItem, FeedField, Item} from './types.ts';
import {STEPS, LAST, RACKS} from './tutorial.ts';
import type {TutorialStep} from './tutorial.ts';

// Actions triggered by the panel, implemented in main.ts
export interface Actions {
  removeItem(key: string): void;
  togglePanel(): void;
  showPanel(): void;
  stopPlacing(): void;
  setUtility(u: number): void;
  setTool(id: string): void;
  setPlaceMode(mode: 'one' | 'row'): void;
  togglePower(): void;
  loadPreset(name: PresetName): void;
  toggleFailed(key: string): void;
  setPlacePhase(n: number): void;
  setViewPhase(n: number | null): void;
  setHeadroomType(type: string): void;
  setEnergy(change: Partial<EnergyInputs>): void;
  setItemPhase(key: string, phase: number): void;
  setFeedChoice(key: string, field: FeedField, value: string): void;
  toggleAssignMode(key: string): void;
  restoreAll(): void;
  setLang(id: string): void;
  startTutorial(): void;
  tutorialNext(): void;
  exitTutorial(): void;
  dismissTutorialOffer(): void;
  undo(): void;
  redo(): void;
  resetView(): void;
  copyShareLink(): void;
  importUsdFile(file: File): void;
  exportUsd(): void;
  exportLayout(): void;
  saveImage(): void;
  exportHint(): string;
}

let actions: Actions;

export function mountUI(a: Actions, stage: HTMLElement, panel: HTMLElement): void{
  actions = a;
  createRoot(panel).render(<StrictMode><App stage={stage} /></StrictMode>);
}

const UTIL = [2, 5, 10];
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const bad: CSSProperties = {color: 'var(--bad)'};
const muted: CSSProperties = {color: 'var(--muted)'};

function App({stage}: {stage: HTMLElement}){
  const version = useStateVersion();
  const lang = getLang();
  const model = useMemo(hallModel, [version, lang]);
  useEffect(() => {
    document.title = tr('title');
    document.documentElement.lang = htmlLang();
  }, [lang]);
  return (
    <>
      {createPortal(<StageOverlay model={model} />, stage)}
      <PanelBar model={model} />
      <Header />
      <Tutorial model={model} version={version} />
      <h2>{tr('hUtility')}</h2>
      <div className="row seg" id="utility">
        {UTIL.map(u => <button key={u} type="button" data-u={u} aria-pressed={u === state.utility} onClick={() => actions.setUtility(u)}>{u} MW</button>)}
      </div>
      <Devices />
      <Capacity model={model} />
      <h2 id="hInfo">{tr('hInfo')}</h2>
      <Info model={model} />
      <Growth model={model} />
      <Energy model={model} />
      <Compare model={model} />
      <Drill model={model} />
      <Presets />
      <Share notice={state.ui.share} />
      <Usd notice={state.ui.usd} />
      <p className="foot">{tr('foot')}</p>
    </>
  );
}

function StageOverlay({model}: {model: HallModel}){
  const s = model.totals;
  return (
    <>
      <div id="hud" aria-live="polite">
        <div><b id="hGpu">{s.gpus.toLocaleString()}</b><span>GPU</span></div>
        <div><b id="hIt">{fmt(s.it)}</b><span>{tr('hudIt')}</span></div>
        <div><b id="hPue">{s.it ? s.pue.toFixed(2) : '–'}</b><span>{tr('hudPue')}</span></div>
        {s.it > 0 && <p id="hScale">{tr('hudScale', {sparks: scaleRefs(s.it).sparks.toLocaleString(), homes: scaleRefs(s.it).homes.toLocaleString()})}</p>}
      </div>
      <StageBar />
      <div id="stageTools">
        <button id="undo" type="button" title={MAC ? '⌘Z' : 'Ctrl+Z'} aria-keyshortcuts="Meta+Z Control+Z" disabled={!state.ui.canUndo} onClick={() => actions.undo()}>{tr('undo')}</button>
        <button id="redo" type="button" title={MAC ? '⇧⌘Z' : 'Ctrl+Y'} aria-keyshortcuts="Meta+Shift+Z Control+Y" disabled={!state.ui.canRedo} onClick={() => actions.redo()}>{tr('redo')}</button>
        <button id="camReset" type="button" onClick={() => actions.resetView()}>{tr('camReset')}</button>
      </div>
    </>
  );
}

// Narrow screens only (hidden by CSS on wide ones): what a tap on the 3D view will do, with the matching buttons,
// so a phone user does not have to scroll the panel to see the current mode or the selected device
function StageBar(){
  const sel = state.selected ? state.items.get(state.selected) : undefined;
  let text: string, buttons: ReactNode;
  if (state.assignFrom){
    const from = state.items.get(state.assignFrom), key = state.assignFrom;
    text = tr('barAssign', {name: from ? catName(CAT[from.type]) : ''});
    buttons = <button type="button" onClick={() => actions.toggleAssignMode(key)}>{tr('barDone')}</button>;
  } else if (state.tool){
    const name = catName(CAT[state.tool]), n = [...state.items.values()].filter(it => it.type === state.tool).length;
    text = state.placeMode === 'row' ? tr(state.rowAnchor ? 'barRowEnd' : 'barRowStart', {name})
      : state.ui.lastPlaced === state.tool ? tr('barPlaced', {name, n}) : tr('barPlace', {name});
    buttons = <button type="button" id="barDone" onClick={() => actions.stopPlacing()}>{tr('barDone')}</button>;
  } else if (sel && state.selected){
    const key = state.selected;
    text = `${catName(CAT[sel.type])} · ${loc(sel.x, sel.z)}`;
    buttons = <>
      <button type="button" id="barDetails" onClick={() => { actions.showPanel(); scrollPanelTo('#hInfo'); }}>{tr('barDetails')}</button>
      <button type="button" id="barRemove" onClick={() => actions.removeItem(key)}>{tr('barRemove')}</button>
    </>;
  } else return null;
  return <div id="stageBar" aria-live="polite"><span>{text}</span><div className="row">{buttons}</div></div>;
}

// Scroll the panel so an element sits just below its sticky top bar (after React has rendered the expanded panel)
function scrollPanelTo(selector: string){
  requestAnimationFrame(() => {
    const el = document.querySelector(selector), panel = document.querySelector('#panel');
    if (!el || !panel) return;
    const top = (document.querySelector('#panelBar')?.getBoundingClientRect().bottom ?? panel.getBoundingClientRect().top) + 8;
    panel.scrollBy({top: el.getBoundingClientRect().top - top});
  });
}

// Narrow screens only: hall status and a button that folds the panel away so the 3D view gets the whole screen
function PanelBar({model}: {model: HallModel}){
  const collapsed = state.ui.panelCollapsed, s = model.totals;
  useEffect(() => { document.body.classList.toggle('panel-collapsed', collapsed); }, [collapsed]);
  const problems = [...s.issues, ...model.perDevice].filter(i => i.lvl === 'bad').length;
  const [text, cls] = !s.it ? [tr('barEmpty'), 'warn'] : state.powered ? [tr('barPowered'), 'ok']
    : model.blocking ? [tr('barBlocked', {n: Math.max(problems, 1)}), 'bad'] : [tr('barReady'), 'ok'];
  return (
    <div id="panelBar">
      <span id="panelStatus" className={cls}>{text}</span>
      <button type="button" id="panelToggle" aria-expanded={!collapsed} onClick={() => actions.togglePanel()}>{tr(collapsed ? 'panelShow' : 'panelHide')}</button>
    </div>
  );
}

function Header(){
  return (
    <>
      <div className="head">
        <h1>{tr('title')}</h1>
        <div className="row seg lang" id="lang" role="group" aria-label={tr('language')}>
          {LANGS.map(l => <button key={l.id} type="button" data-lang={l.id} lang={l.html} aria-pressed={l.id === getLang()} onClick={() => actions.setLang(l.id)}>{l.label}</button>)}
        </div>
      </div>
      <p className="sub">{tr('subtitle')}</p>
    </>
  );
}

function Devices(){
  // Phase buttons: existing phases plus a "next phase" one shown as "+", up to MAX_PHASE
  const phases = phasesIn([...state.items.values()]), next = (phases.at(-1) || 1) + 1;
  const phaseButtons = [...new Set([...phases, 1, state.phase])].sort((a, b) => a - b).concat(state.phase === next || next > MAX_PHASE ? [] : [next]);
  const hint = state.placeMode !== 'row' ? '' : !state.tool ? tr('rowHintTool') : tr(state.rowAnchor ? 'rowHintEnd' : 'rowHintStart');
  return (
    <>
      <div className="h2row">
        <h2>{tr('hDevices')}</h2>
        <div className="row seg mini" id="placeMode" role="group" aria-label={tr('placeMode')}>
          {(['one', 'row'] as const).map(mode =>
            <button key={mode} type="button" data-mode={mode} aria-pressed={state.placeMode === mode} onClick={() => actions.setPlaceMode(mode)}>{tr(mode === 'one' ? 'placeOne' : 'placeRow')}</button>)}
        </div>
      </div>
      <div className="h2row sub-row">
        <span>{tr('placePhase')}</span>
        <div className="row seg mini" id="placePhase" role="group" aria-label={tr('placePhase')}>
          {phaseButtons.map(n => {
            const isNew = n === next && !phases.includes(n) && state.phase !== n;
            return <button key={n} type="button" data-phase={n} aria-pressed={state.phase === n} aria-label={isNew ? tr('phaseNew') : undefined} onClick={() => actions.setPlacePhase(n)}>{isNew ? '+' : n}</button>;
          })}
        </div>
      </div>
      <p className="sub" id="placeHint" hidden={!hint}>{hint}</p>
      <div className="palette" id="palette">
        {CATALOG.map(t => {
          const bits = [t.kw ? t.kw + ' kW' : '', t.gpus ? t.gpus + ' GPU' : '', t.liqCool ? tr('chipCooling', {kw: t.liqCool}) : '',
            t.airCool ? tr('chipCooling', {kw: t.airCool}) : '', t.dist ? tr('chipDist', {kw: t.dist}) : '', t.ports ? tr('chipPorts', {n: t.ports}) : ''].filter(Boolean).join(tr('listSep'));
          return (
            <button key={t.id} type="button" className="chip" data-t={t.id} aria-pressed={state.tool === t.id} onClick={() => actions.setTool(t.id)}>
              <i style={{background: `var(${t.c})`}}></i><div><strong>{catName(t)}</strong><small>{bits}</small></div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Gauge({label, value, cap, cssVar, text}: {label: string; value: number; cap: number; cssVar: string; text?: string}){
  const pct = cap ? Math.min(100, value / cap * 100) : (value ? 100 : 0);
  const over = value > cap;
  return (
    <div className="gauge">
      <div className="top"><span>{label}</span><em style={{color: over ? 'var(--bad)' : 'inherit'}}>{text ?? `${fmt(value)} / ${fmt(cap)}`}</em></div>
      <div className="bar"><i style={{width: `${pct}%`, background: `var(${over ? '--bad' : cssVar})`}}></i></div>
    </div>
  );
}

function Capacity({model}: {model: HallModel}){
  const s = model.totals;
  // Notes about the current view come first, then hall-wide total checks, then per-device overloads
  const issues = [
    ...(state.viewPhase !== null ? [{lvl: 'warn', txt: tr('viewIssues', {n: state.viewPhase})}] : []),
    ...(state.failed.size ? [{lvl: 'warn', txt: tr('drillIssues', {n: state.failed.size})}] : []),
    ...s.issues, ...model.perDevice,
  ];
  return (
    <>
      <h2>{tr('hCheck')}</h2>
      <div id="gauges">
        <Gauge label={tr('gaugeDist')} value={s.it} cap={s.dist} cssVar="--copper" />
        <Gauge label={tr('gaugeLiquid')} value={s.liqHeat} cap={s.liqCap} cssVar="--coolant" />
        <Gauge label={tr('gaugeAir')} value={s.airHeat} cap={s.airCap} cssVar="--air" />
        <Gauge label={tr('gaugeNetwork')} value={s.gpus} cap={s.ports} cssVar="--net" text={tr('ports', {used: s.gpus, total: s.ports})} />
        <Gauge label={tr('gaugeUtility')} value={s.facility} cap={state.utility * 1000} cssVar="--ink" />
        <div className="gauge"><div className="top"><span>{tr('gaugeCapex')}</span><em>{tr('capex', {m: s.capex.toFixed(1)})}</em></div></div>
      </div>
      <ul className="issues" id="issues">
        {!s.it
          ? <li className="warn">{tr('issueEmpty')}</li>
          : <>
            {issues.map((i, n) => <li key={n} className={i.lvl}>{i.txt}</li>)}
            {!model.blocking && <li className="ok">{tr('issueOk')}</li>}
          </>}
      </ul>
      {/* After power-on, a failure drill that breaks the checks still allows powering off */}
      <button id="power" type="button" className={state.powered ? 'on' : undefined} disabled={!s.it || (model.blocking && !state.powered)} onClick={() => actions.togglePower()}>
        {tr(state.powered ? 'powerOff' : 'powerOn')}
      </button>
    </>
  );
}

// Reasons for failing the capacity check (blockingReasons in redundancy.ts) as short phrases
const REASON_TEXT = {dist: 'reasonDist', liquid: 'reasonLiquid', air: 'reasonAir', network: 'reasonNetwork', utility: 'reasonUtility'} as const;
function reasonText(r: Reason): string{
  if (r.kind === 'overload') return tr('reasonOverload', {label: r.item.type.toUpperCase(), loc: loc(r.item.x, r.item.z)});
  return tr(REASON_TEXT[r.kind]);
}

type Row = [string, ReactNode];

// Supply relations in the details panel: CDUs and RPPs show their load, other devices pick which unit supplies coolant and power.
// The first option is nearest (the current nearest unit in parentheses); if the manually assigned unit is out of the calculation
// (failure drill), the actual connection is the nearest one
function supplyRows(t: CatalogItem, info: SupplyInfo | undefined, key: string): Row[]{
  if (!info) return [];
  const rows: Row[] = [];
  if (info.supply){
    const {loadKw, capacityKw, consumers, overloaded} = info.supply;
    const text = `${fmt(loadKw)} / ${fmt(capacityKw)}`;
    rows.push([tr('rowLoad'), overloaded ? <span style={bad}>{text + tr('overloadedSuffix')}</span> : text], [tr('rowConsumers'), tr('deviceCount', {n: consumers.length})]);
  }
  const source = (field: FeedField, label: string, row: 'rowCoolantFrom' | 'rowPowerFrom', needed: boolean) => {
    if (!needed) return;
    const s = info.links?.[field];
    const all = [...state.items.values()].filter(i => i.type === FEEDS[field].type);
    if (!all.length){ rows.push([tr(row), <span style={bad}>{tr('noSupply', {label})}</span>]); return; }
    const it = info.item, want = it.feeds?.[field];
    const near = nearest(it, info.active.filter(i => i.type === FEEDS[field].type))?.a;
    const loadOf = (i: Item) => { const a = info.active.find(a => a.x === i.x && a.z === i.z), sup = a && info.loads.supplies.get(a); return sup ? `${fmt(sup.loadKw)} / ${fmt(sup.capacityKw)}` : tr('statusFailed'); };
    const value = want && all.some(i => i.x === want[0] && i.z === want[1]) ? `${want[0]},${want[1]}` : 'auto';
    const options = all.sort((a, b) => Math.hypot(a.x - it.x, (a.z - it.z) * 2) - Math.hypot(b.x - it.x, (b.z - it.z) * 2));
    rows.push([tr(row), <>
      <select data-feed={field} aria-label={tr(row)} value={value} onChange={e => actions.setFeedChoice(key, field, e.target.value)}>
        <option value="auto">{tr('feedNearest', {source: near ? tr('supplyAt', {label, loc: loc(near.x, near.z)}) : tr('feedNone')})}</option>
        {options.map(i => <option key={`${i.x},${i.z}`} value={`${i.x},${i.z}`}>{tr('supplyAt', {label, loc: loc(i.x, i.z)})} · {loadOf(i)}</option>)}
      </select>
      {s && info.loads.supplies.get(s)?.overloaded && <div><span style={bad}>{tr('supplyAt', {label, loc: loc(s.x, s.z)}) + tr('overloadedSuffix')}</span></div>}
    </>]);
  };
  source('coolantSource', 'CDU', 'rowCoolantFrom', (t.kw || 0) > 0 && (t.liq || 0) > 0);
  source('powerFeed', 'RPP', 'rowPowerFrom', (t.kw || 0) > 0);
  return rows;
}

function Info({model}: {model: HallModel}){
  const key = state.selected, it = key ? state.items.get(key) : undefined;
  const t = it ? CAT[it.type] : state.tool ? CAT[state.tool] : null;
  if (!t) return <div className="info" id="info">{tr('infoEmpty')}</div>;
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
  if (failed) rows.push([tr('rowStatus'), <span style={bad}>{tr('statusFailed')}</span>]);
  if (it && key){
    const maxPhase = phasesIn([...state.items.values()]).at(-1) || 1;
    rows.push([tr('rowPhase'),
      <select id="itemPhase" aria-label={tr('rowPhase')} value={it.phase || 1} onChange={e => actions.setItemPhase(key, Number(e.target.value))}>
        {Array.from({length: Math.min(maxPhase + 1, MAX_PHASE)}, (_, i) => i + 1).map(n => <option key={n} value={n}>{tr('phaseN', {n})}</option>)}
      </select>]);
    rows.push(...supplyRows(t, model.supplyByKey.get(keyOf(it.x, it.z)), key));
  }
  const at = it ? tr('infoAt', {x: it.x + 1, z: it.z + 1, loc: loc(it.x, it.z)}) : tr('infoPlaceHint');
  return (
    <div className="info" id="info">
      <strong>{catName(t)}</strong><span style={muted}>{at}</span>
      <table><tbody>{rows.map(([label, value]) => <tr key={label}><td>{label}</td><td>{value}</td></tr>)}</tbody></table>
      {it && assigning && <p className="assign-hint">{tr('assignHint', {label: it.type.toUpperCase()})}</p>}
      <p>{catNote(t)}</p>
      {it && key && (
        <div className="row" style={{marginTop: 8}}>
          {supplyType && <button type="button" id="assignToggle" aria-pressed={assigning} onClick={() => actions.toggleAssignMode(key)}>{tr(assigning ? 'assignDone' : 'assignStart')}</button>}
          {failable && <button type="button" id="failToggle" title="F" aria-keyshortcuts="F" onClick={() => actions.toggleFailed(key)}>{tr(failed ? 'drillRestore' : 'drillFail')}</button>}
          <button type="button" id="del" onClick={() => actions.removeItem(key)}>{tr('remove')}</button>
        </div>
      )}
    </div>
  );
}

// Growth planning: cumulative per-phase table, and headroom as of the currently viewed phase
const KIND_LABEL = {dist: 'gaugeDist', liquid: 'gaugeLiquid', air: 'gaugeAir', network: 'gaugeNetwork', utility: 'gaugeUtility'} as const satisfies Record<ReasonKind, MessageKey>;
const pct = (r: number): string => r === Infinity ? '∞' : Math.round(r * 100) + '%';

const fmtEnergy = (mwh: number): string => mwh >= 1000 ? (mwh / 1000).toFixed(mwh >= 10000 ? 1 : 2) + ' GWh' : Math.round(mwh).toLocaleString() + ' MWh';
const fmtMoney = (usd: number): string => usd >= 1e6 ? '$' + (usd / 1e6).toFixed(2) + 'M' : '$' + Math.round(usd / 1e3).toLocaleString() + 'K';

// Annual energy and electricity cost for the devices in the current calculation (energy.ts). The price field keeps its own text
// while typing, so partial input such as "0." is not rewritten; only valid numbers reach the state
function Energy({model}: {model: HallModel}){
  const {price, load} = state.energy;
  const [priceText, setPriceText] = useState(String(price));
  useEffect(() => { if (Number(priceText) !== price) setPriceText(String(price)); }, [price]);
  const e = annualEnergy(model.totals, state.energy);
  const rows: Row[] = [
    [tr('rowItEnergy'), fmtEnergy(e.itMWh)],
    [tr('rowOverheadEnergy'), fmtEnergy(e.overheadMWh)],
    [tr('rowTotalEnergy'), fmtEnergy(e.totalMWh)],
    [tr('rowAnnualPue'), e.pue.toFixed(2)],
    [tr('rowCost'), <span id="energyCost">{fmtMoney(e.cost)}</span>],
  ];
  return (
    <>
      <h2>{tr('hEnergy')}</h2>
      <div className="energy" id="energy">
        <label>
          <span>{tr('energyPrice')}</span>
          <input id="energyPrice" type="number" inputMode="decimal" min={PRICE_RANGE[0]} max={PRICE_RANGE[1]} step={0.01} value={priceText}
            onChange={ev => { setPriceText(ev.target.value); const v = ev.target.valueAsNumber; if (Number.isFinite(v)) actions.setEnergy({price: v}); }}
            onBlur={() => setPriceText(String(state.energy.price))} />
        </label>
        <label>
          <span>{tr('energyLoad', {pct: Math.round(load * 100)})}</span>
          <input id="energyLoad" type="range" min={LOAD_RANGE[0] * 100} max={LOAD_RANGE[1] * 100} step={5} value={Math.round(load * 100)}
            onChange={ev => actions.setEnergy({load: ev.target.valueAsNumber / 100})} />
        </label>
        {model.totals.it
          ? <table><tbody>{rows.map(([k, v], i) => <tr key={i} className={i === rows.length - 1 ? 'total' : undefined}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          : <p className="sub">{tr('energyEmpty')}</p>}
      </div>
      <p className="sub" style={{marginTop: 6}}>{tr('energyNote')}</p>
    </>
  );
}

// For each GPU rack type, the largest hall the current utility feed can run (compare.ts). The card for the hall's most common rack type is marked
function Compare({model}: {model: HallModel}){
  const halls = useMemo(() => compareRacks(CAT, state.utility, GRID), [state.utility]);
  const counts = new Map<string, number>();
  model.all.forEach(i => { if (CAT[i.type].gpus) counts.set(i.type, (counts.get(i.type) || 0) + 1); });
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const maxCells = Math.max(...halls.map(h => h.racks + h.support.cdu + h.support.rpp + h.support.crah + h.support.ib));
  return (
    <>
      <h2>{tr('hCompare')}</h2>
      <p className="sub">{tr('compareIntro', {u: state.utility})}</p>
      <div className="compare" id="compare">
        {halls.map(h => {
          const t = CAT[h.type], cells = h.racks + h.support.cdu + h.support.rpp + h.support.crah + h.support.ib;
          return (
            <div key={h.type} className="cmp" data-t={h.type} aria-current={h.type === main || undefined}>
              <i style={{background: `var(${t.c})`}}></i>
              <div>
                <strong>{catName(t)}</strong>
                <b>{tr('compareRacks', {n: h.racks, gpus: h.gpus.toLocaleString()})}</b>
                <div className="bar" title={tr('compareCells', {cells})}><i style={{width: `${cells / maxCells * 100}%`, background: `var(${t.c})`}}></i></div>
                <small>{tr('compareDetail', {kw: t.kw || 0, cells, pue: h.pue.toFixed(2), m: h.capex.toFixed(0)})}</small>
                {h.limit === 'floor' && <small>{tr('compareFloor')}</small>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="sub" style={{marginTop: 6}}>{tr('compareNote')}</p>
    </>
  );
}

function Growth({model}: {model: HallModel}){
  const phases = phasesIn(model.all);
  const plan = growthPlan(model.all, CAT, state.utility);
  const toggleView = (n: number) => actions.setViewPhase(state.viewPhase === n ? null : n);
  let body: ReactNode = null;
  if (plan.length){
    const fails = plan.filter(p => p.reasons.length);
    // Headroom defaults to the most common GPU rack type in the layout
    const counts = new Map<string, number>();
    model.planned.forEach(i => { if (CAT[i.type].gpus) counts.set(i.type, (counts.get(i.type) || 0) + 1); });
    const type = state.headroomType || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'vr200';
    const room = headroom(model.planned, CAT, state.utility, type);
    const asOf = state.viewPhase ?? plan[plan.length - 1].phase;
    body = <>
      <table className="growth">
        <thead><tr><th>{tr('colPhase')}</th><th>GPU</th><th>{tr('hudIt')}</th><th>{tr('colTightest')}</th><th>{tr('colStatus')}</th></tr></thead>
        <tbody>
          {plan.map(p => {
            const ok = !p.reasons.length, current = state.viewPhase === p.phase || (state.viewPhase === null && p === plan[plan.length - 1]);
            return (
              <tr key={p.phase} data-phase={p.phase} className={current ? 'current' : ''} tabIndex={0}
                onClick={() => toggleView(p.phase)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleView(p.phase); } }}>
                <td>{p.phase}</td><td>{p.gpus.toLocaleString()}</td><td>{fmt(p.itKw)}</td>
                <td>{tr(KIND_LABEL[p.tightest.kind])} {pct(p.tightest.ratio)}</td>
                <td style={{color: `var(${ok ? '--ok' : '--bad'})`}}>{tr(ok ? 'statusOk' : 'statusFail')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fails.length > 0 && <ul className="issues">{fails.map(p => <li key={p.phase} className="bad">{tr('growthFail', {n: p.phase, reasons: p.reasons.map(reasonText).join(tr('listSep'))})}</li>)}</ul>}
      <p className="room">
        <select id="headroomType" aria-label={tr('headroomType')} value={type} onChange={e => actions.setHeadroomType(e.target.value)}>
          {CATALOG.filter(t => t.gpus).map(t => <option key={t.id} value={t.id}>{catName(t)}</option>)}
        </select>{' '}
        {tr('headroom', {phase: asOf, n: room.count === Infinity ? '∞' : room.count, limit: room.limit ? tr(KIND_LABEL[room.limit]).toLowerCase() : '–'})}
      </p>
      <p className="sub">{tr('headroomNote')}</p>
    </>;
  }
  return (
    <>
      <h2>{tr('hGrowth')}</h2>
      <p className="sub">{tr('growthIntro')}</p>
      <div className="h2row sub-row" id="viewPhaseRow" hidden={phases.length < 2}>
        <span>{tr('viewLabel')}</span>
        <div className="row seg mini" id="viewPhase" role="group" aria-label={tr('viewLabel')}>
          <button type="button" data-phase="all" aria-pressed={state.viewPhase === null} onClick={() => actions.setViewPhase(null)}>{tr('viewAll')}</button>
          {phases.slice(0, -1).map(n => <button key={n} type="button" data-phase={n} aria-pressed={state.viewPhase === n} onClick={() => actions.setViewPhase(n)}>{n}</button>)}
        </div>
      </div>
      <div id="growth">{body}</div>
    </>
  );
}

// Failure drill: current failure count, and the N+1 check of the planned layout ignoring the drill
const MAX_SPOF = 5;
function Drill({model}: {model: HallModel}){
  const planned = model.planned;
  let items: ReactNode = null;
  if (planned.some(i => canFail(CAT[i.type]))){
    const spof = singlePointsOfFailure(planned, CAT, state.utility);
    if (spof === null) items = <li className="warn">{tr('n1Blocked')}</li>;
    else if (!spof.length) items = <li className="ok">{tr('n1Ok')}</li>;
    else items = <>
      <li className="warn">{tr('n1Bad', {n: spof.length})}</li>
      {spof.slice(0, MAX_SPOF).map(r =>
        <li key={keyOf(r.item.x, r.item.z)} className="warn">{tr('n1Item', {name: catName(CAT[r.item.type]), loc: loc(r.item.x, r.item.z), reasons: r.reasons.map(reasonText).join(tr('listSep'))})}</li>)}
      {spof.length > MAX_SPOF && <li className="warn">{tr('moreMessages', {n: spof.length - MAX_SPOF})}</li>}
    </>;
  }
  return (
    <>
      <h2>{tr('hDrill')}</h2>
      <p className="sub">{tr('drillIntro')}</p>
      <div className="row" id="drillBar" style={{alignItems: 'center', marginBottom: 6}} hidden={!state.failed.size}>
        <span id="drillStatus">{tr('drillActive', {n: state.failed.size})}</span>
        <button type="button" id="drillRestoreAll" onClick={() => actions.restoreAll()}>{tr('drillRestoreAll')}</button>
      </div>
      <ul className="issues" id="n1">{items}</ul>
    </>
  );
}

// Guided tutorial card at the top of the panel, or the first-visit offer. The current step's control gets a pulsing outline
// Steps whose text has no variables
const TUTORIAL_TEXT = {
  pick: 'tutPick', why: 'tutWhy', power: 'tutPower', liquid: 'tutLiquid', air: 'tutAir',
  network: 'tutNetwork', utility: 'tutUtility', powerOn: 'tutPowerOn',
} as const satisfies Record<Exclude<TutorialStep['id'], 'place' | 'done'>, MessageKey>;

function stepText(id: TutorialStep['id'], model: HallModel): string{
  if (id === 'place') return tr('tutPlace', {n: RACKS, gap: RACKS - 1});
  if (id === 'done') return tr('tutDone', {gpus: model.totals.gpus.toLocaleString(), pue: model.totals.it ? model.totals.pue.toFixed(2) : '–'});
  return tr(TUTORIAL_TEXT[id]);
}

function Tutorial({model, version}: {model: HallModel; version: number}){
  const index = state.tutorial, step = index === null ? null : STEPS[index];
  // Re-apply after every render: React may rewrite the target's className (for example the power button)
  useEffect(() => {
    const el = step?.target ? document.querySelector(step.target) : null;
    el?.classList.add('tut-target');
    return () => el?.classList.remove('tut-target');
  }, [step, version]);
  // When the step changes, scroll the panel so the highlighted control sits below the card, which is sticky at the top
  useEffect(() => {
    const el = step?.target ? document.querySelector(step.target) : null, panel = document.querySelector('#panel');
    if (!el || !panel) return;
    const t = el.getBoundingClientRect(), p = panel.getBoundingClientRect();
    const top = (document.querySelector('#tutorial')?.getBoundingClientRect().bottom ?? p.top) + 12, bottom = p.bottom - 12;
    if (t.top < top) panel.scrollBy({top: t.top - top});
    else if (t.bottom > bottom) panel.scrollBy({top: Math.min(t.bottom - bottom, t.top - top)});
  }, [step]);
  if (!step || index === null){
    if (!state.ui.tutorialOffer) return null;
    return (
      <div className="tutorial" id="tutorialOffer">
        <p>{tr('tutorialOffer')}</p>
        <div className="row">
          <button type="button" id="tutorialStart" onClick={() => actions.startTutorial()}>{tr('tutorialStart')}</button>
          <button type="button" id="tutorialDismiss" onClick={() => actions.dismissTutorialOffer()}>{tr('tutorialDismiss')}</button>
        </div>
      </div>
    );
  }
  return (
    <section className="tutorial" id="tutorial" data-step={step.id} aria-live="polite">
      <div className="tutorial-head"><strong>{tr('tutorialTitle')}</strong><span>{tr('tutorialStep', {n: index + 1, total: STEPS.length})}</span></div>
      <p>{stepText(step.id, model)}</p>
      <div className="row">
        {step.manual && index < LAST && <button type="button" id="tutorialNext" onClick={() => actions.tutorialNext()}>{tr('tutorialNext')}</button>}
        {index === LAST
          ? <button type="button" id="tutorialClose" onClick={() => actions.exitTutorial()}>{tr('tutorialClose')}</button>
          : <button type="button" id="tutorialExit" onClick={() => actions.exitTutorial()}>{tr('tutorialExit')}</button>}
      </div>
    </section>
  );
}

const PRESET_BUTTONS = [['empty', 'presetEmpty'], ['gb200', 'presetGb200'], ['gb200n1', 'presetGb200n1'], ['rubin', 'presetRubin']] as const;
function Presets(){
  return (
    <>
      <h2>{tr('hPresets')}</h2>
      <div className="row">
        {PRESET_BUTTONS.map(([name, label]) => <button key={name} type="button" data-preset={name} onClick={() => actions.loadPreset(name)}>{tr(label)}</button>)}
        <button type="button" id="tutorialRestart" onClick={() => actions.startTutorial()}>{tr('tutorialStart')}</button>
      </div>
    </>
  );
}

// Warnings can contain prim names from imported files; React renders them as text, never as HTML
const MAX_WARNINGS = 8;
function Warnings({id, warnings}: {id: string; warnings: string[]}){
  const shown = warnings.slice(0, MAX_WARNINGS);
  return (
    <ul className="issues" id={id}>
      {shown.map((w, i) => <li key={i} className="warn">{w}</li>)}
      {warnings.length > MAX_WARNINGS && <li className="warn">{tr('moreMessages', {n: warnings.length - MAX_WARNINGS})}</li>}
    </ul>
  );
}

function Share({notice}: {notice: Notice}){
  return (
    <>
      <h2>{tr('hShare')}</h2>
      <div className="row">
        <button type="button" id="shareCopy" onClick={() => actions.copyShareLink()}>{tr('shareCopy')}</button>
        <button type="button" id="imageSave" disabled={!state.ui.exportReady || state.ui.exporting} onClick={() => actions.saveImage()}>{tr('imageSave')}</button>
      </div>
      <p className="sub" id="shareMsg" style={{marginTop: 6}}>{notice.text ?? tr('shareHint')}</p>
      <Warnings id="shareWarnings" warnings={notice.warnings} />
    </>
  );
}

function Usd({notice}: {notice: Notice}){
  const file = useRef<HTMLInputElement>(null);
  return (
    <div id="usdBox" hidden={!state.ui.exportReady}>
      <h2>OpenUSD</h2>
      <div className="row">
        <button type="button" id="usdExport" disabled={state.ui.exporting} onClick={() => actions.exportUsd()}>{tr('usdExport')}</button>
        <button type="button" id="usdImport" onClick={() => file.current?.click()}>{tr('usdImport')}</button>
        <button type="button" id="layoutExport" disabled={state.ui.exporting} onClick={() => actions.exportLayout()}>{tr('layoutExport')}</button>
        <input type="file" id="usdFile" accept=".usda,.usd" hidden ref={file} onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';   // allow choosing the same file again
          if (f) actions.importUsdFile(f);
        }} />
      </div>
      <p className="sub" id="usdMsg" style={{marginTop: 6}}>{notice.text ?? (state.ui.exportReady ? actions.exportHint() : '')}</p>
      <Warnings id="usdWarnings" warnings={notice.warnings} />
    </div>
  );
}
