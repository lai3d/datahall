// 右侧面板：市电选择、设备色板、容量仪表、问题列表、通电按钮、详情
import {CATALOG, CAT} from './catalog.js';
import {compute, fmt} from './sim.js';
import {supplyLoads, supplyIssues} from './supply.js';
import {keyOf, nearest, FEEDS} from './grid.js';
import {canFail, singlePointsOfFailure} from './redundancy.js';
import {state, itemList} from './state.js';
import {LANGS, getLang, tr, loc, catName, catNote} from './i18n.js';

const $ = s => document.querySelector(s);
const UTIL = [2, 5, 10];
let actions;
let supplyByKey = new Map();   // 设备 key → {supply, source}，供详情面板使用

export function initUI(a){
  actions = a;
  $('#utility').onclick = e => { const b = e.target.closest('button'); if (b) actions.setUtility(+b.dataset.u); };
  $('#palette').onclick = e => { const b = e.target.closest('button'); if (b) actions.setTool(b.dataset.t); };
  $('#placeMode').onclick = e => { const b = e.target.closest('button'); if (b) actions.setPlaceMode(b.dataset.mode); };
  $('#power').onclick = () => actions.togglePower();
  $('#lang').onclick = e => { const b = e.target.closest('button'); if (b) actions.setLang(b.dataset.lang); };
  $('#drillRestoreAll').onclick = () => actions.restoreAll();
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => actions.loadPreset(b.dataset.preset));
}

// index.html 里带 data-i18n 的静态文案，以及语言切换按钮
export function applyStaticText(){
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', tr(el.dataset.i18nAria)));
  $('#lang').innerHTML = LANGS.map(l =>
    `<button type="button" data-lang="${l.id}" lang="${l.html}" aria-pressed="${l.id === getLang()}">${l.label}</button>`).join('');
}

export function buildUI(){
  $('#placeMode').innerHTML = [['one', 'placeOne'], ['row', 'placeRow']].map(([mode, key]) =>
    `<button type="button" data-mode="${mode}" aria-pressed="${state.placeMode === mode}">${tr(key)}</button>`).join('');
  const hint = state.placeMode !== 'row' ? '' : !state.tool ? tr('rowHintTool') : tr(state.rowAnchor ? 'rowHintEnd' : 'rowHintStart');
  $('#placeHint').textContent = hint;
  $('#placeHint').hidden = !hint;
  $('#utility').innerHTML = UTIL.map(u => `<button type="button" data-u="${u}" aria-pressed="${u === state.utility}">${u} MW</button>`).join('');
  $('#palette').innerHTML = CATALOG.map(t => {
    const bits = [t.kw ? t.kw + ' kW' : '', t.gpus ? t.gpus + ' GPU' : '', t.liqCool ? tr('chipCooling', {kw: t.liqCool}) : '',
      t.airCool ? tr('chipCooling', {kw: t.airCool}) : '', t.dist ? tr('chipDist', {kw: t.dist}) : '', t.ports ? tr('chipPorts', {n: t.ports}) : ''].filter(Boolean).join(tr('listSep'));
    return `<button type="button" class="chip" data-t="${t.id}" aria-pressed="${state.tool === t.id}">
      <i style="background:var(${t.c})"></i><div><strong>${catName(t)}</strong><small>${bits}</small></div></button>`;
  }).join('');
}

function gauge(label, v, cap, cssVar){
  const pct = cap ? Math.min(100, v / cap * 100) : (v ? 100 : 0);
  const over = v > cap;
  return `<div class="gauge"><div class="top"><span>${label}</span><em style="color:${over ? 'var(--bad)' : 'inherit'}">${fmt(v)} / ${fmt(cap)}</em></div>
    <div class="bar"><i style="width:${pct}%;background:var(${over ? '--bad' : cssVar})"></i></div></div>`;
}

export function refresh(){
  // 故障演练中标记为故障的设施不参与计算
  const all = itemList();
  const list = all.filter(it => !state.failed.has(keyOf(it.x, it.z)));
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
  $('#gauges').innerHTML =
    gauge(tr('gaugeDist'), s.it, s.dist, '--copper') +
    gauge(tr('gaugeLiquid'), s.liqHeat, s.liqCap, '--coolant') +
    gauge(tr('gaugeAir'), s.airHeat, s.airCap, '--air') +
    `<div class="gauge"><div class="top"><span>${tr('gaugeNetwork')}</span><em style="color:${s.gpus > s.ports ? 'var(--bad)' : 'inherit'}">${tr('ports', {used: s.gpus, total: s.ports})}</em></div>
      <div class="bar"><i style="width:${s.ports ? Math.min(100, s.gpus / s.ports * 100) : (s.gpus ? 100 : 0)}%;background:var(${s.gpus > s.ports ? '--bad' : '--net'})"></i></div></div>` +
    gauge(tr('gaugeUtility'), s.facility, state.utility * 1000, '--ink') +
    `<div class="gauge"><div class="top"><span>${tr('gaugeCapex')}</span><em>${tr('capex', {m: s.capex.toFixed(1)})}</em></div></div>`;
  // 全机房总量的检查在前，逐台设备的超载在后
  const drill = state.failed.size ? [{lvl: 'warn', txt: tr('drillIssues', {n: state.failed.size})}] : [];
  let html = [...drill, ...s.issues, ...perDevice].map(i => `<li class="${i.lvl}">${i.txt}</li>`).join('');
  if (!s.it) html = `<li class="warn">${tr('issueEmpty')}</li>`;
  else if (!blocking) html += `<li class="ok">${tr('issueOk')}</li>`;
  $('#issues').innerHTML = html;
  const btn = $('#power');
  btn.disabled = !s.it || (blocking && !state.powered);   // 通电后演练出问题，仍然可以断电
  btn.classList.toggle('on', state.powered);
  btn.textContent = tr(state.powered ? 'powerOff' : 'powerOn');
  renderDrill(all);
  renderInfo();
}

// 不满足容量检查的原因（redundancy.js 的 blockingReasons）写成短语
function reasonText(r){
  if (r.kind === 'overload') return tr('reasonOverload', {label: r.item.type.toUpperCase(), loc: loc(r.item.x, r.item.z)});
  return tr({dist: 'reasonDist', liquid: 'reasonLiquid', air: 'reasonAir', network: 'reasonNetwork', utility: 'reasonUtility'}[r.kind]);
}

// 故障演练区：当前故障数量，以及不考虑演练时整个布局的 N+1 检查
const MAX_SPOF = 5;
function renderDrill(all){
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
  $('#n1').innerHTML = html;
}

const badText = txt => `<span style="color:var(--bad)">${txt}</span>`;

// 详情面板里的供给关系：CDU、RPP 显示负载，其他设备显示供液和配电来自哪一台
function supplyRows(t, info){
  if (!info) return [];
  const rows = [];
  if (info.supply){
    const {loadKw, capacityKw, consumers, overloaded} = info.supply;
    const text = `${fmt(loadKw)} / ${fmt(capacityKw)}`;
    rows.push([tr('rowLoad'), overloaded ? badText(text + tr('overloadedSuffix')) : text], [tr('rowConsumers'), tr('deviceCount', {n: consumers.length})]);
  }
  // 设备：下拉框选择接哪台，第一项是就近（括号里是现在最近的那台）；手动指定的那台被拿掉（故障演练）时实际接的是就近
  const source = (field, label, row, needed) => {
    if (!needed) return;
    const s = info.links?.[field];
    const all = [...state.items.values()].filter(i => i.type === FEEDS[field].type);
    if (!all.length){ rows.push([tr(row), badText(tr('noSupply', {label}))]); return; }
    const it = info.item, want = it.feeds?.[field];
    const near = nearest(it, info.active.filter(i => i.type === FEEDS[field].type))?.a;
    const loadOf = i => { const sup = info.loads.supplies.get(info.active.find(a => a.x === i.x && a.z === i.z)); return sup ? `${fmt(sup.loadKw)} / ${fmt(sup.capacityKw)}` : tr('statusFailed'); };
    const options = [`<option value="auto">${tr('feedNearest', {source: near ? tr('supplyAt', {label, loc: loc(near.x, near.z)}) : tr('feedNone')})}</option>`,
      ...all.sort((a, b) => Math.hypot(a.x - it.x, (a.z - it.z) * 2) - Math.hypot(b.x - it.x, (b.z - it.z) * 2)).map(i => {
        const v = `${i.x},${i.z}`, chosen = want && want[0] === i.x && want[1] === i.z;
        return `<option value="${v}"${chosen ? ' selected' : ''}>${tr('supplyAt', {label, loc: loc(i.x, i.z)})} · ${loadOf(i)}</option>`;
      })];
    const warn = s && info.loads.supplies.get(s).overloaded ? `<div>${badText(tr('supplyAt', {label, loc: loc(s.x, s.z)}) + tr('overloadedSuffix'))}</div>` : '';
    rows.push([tr(row), `<select data-feed="${field}" aria-label="${tr(row)}">${options.join('')}</select>${warn}`]);
  };
  source('coolantSource', 'CDU', 'rowCoolantFrom', t.kw > 0 && t.liq > 0);
  source('powerFeed', 'RPP', 'rowPowerFrom', t.kw > 0);
  return rows;
}

export function renderInfo(){
  const box = $('#info');
  const it = state.selected && state.items.get(state.selected);
  const t = it ? CAT[it.type] : state.tool ? CAT[state.tool] : null;
  if (!t){ box.innerHTML = tr('infoEmpty'); return; }
  const rows = [];
  if (t.kw) rows.push([tr('rowPower'), t.kw + ' kW']);
  if (t.gpus) rows.push([tr('rowGpu'), t.gpus]);
  if (t.kw) rows.push([tr('rowCooling'), t.liq ? tr('liquidPct', {pct: Math.round(t.liq * 100)}) : tr('air')]);
  if (t.liqCool) rows.push([tr('rowLiquidCap'), t.liqCool + ' kW']);
  if (t.airCool) rows.push([tr('rowAirCap'), t.airCool + ' kW']);
  if (t.dist) rows.push([tr('rowDistCap'), t.dist + ' kW']);
  if (t.ports) rows.push([tr('rowPorts'), t.ports]);
  rows.push([tr('rowPrice'), '$' + t.cap + 'M']);
  const failable = !!it && canFail(t), failed = failable && state.failed.has(state.selected);
  const supplyType = !!it && (it.type === 'cdu' || it.type === 'rpp'), assigning = supplyType && state.assignFrom === state.selected;
  if (supplyType){
    const field = it.type === 'cdu' ? 'coolantSource' : 'powerFeed';
    const manual = [...state.items.values()].filter(i => i.feeds?.[field]?.[0] === it.x && i.feeds[field][1] === it.z).length;
    if (manual) rows.push([tr('rowManual'), tr('deviceCount', {n: manual})]);
  }
  if (failed) rows.push([tr('rowStatus'), badText(tr('statusFailed'))]);
  if (it) rows.push(...supplyRows(t, supplyByKey.get(keyOf(it.x, it.z))));
  const at = it ? tr('infoAt', {x: it.x + 1, z: it.z + 1, loc: loc(it.x, it.z)}) : tr('infoPlaceHint');
  box.innerHTML = `<strong>${catName(t)}</strong><span style="color:var(--muted)">${at}</span>
    <table>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    ${assigning ? `<p class="assign-hint">${tr('assignHint', {label: it.type.toUpperCase()})}</p>` : ''}
    <p>${catNote(t)}</p>
    ${it ? `<div class="row" style="margin-top:8px">${supplyType ? `<button type="button" id="assignToggle" aria-pressed="${assigning}">${tr(assigning ? 'assignDone' : 'assignStart')}</button>` : ''}${failable ? `<button type="button" id="failToggle" title="F" aria-keyshortcuts="F">${tr(failed ? 'drillRestore' : 'drillFail')}</button>` : ''}<button type="button" id="del">${tr('remove')}</button></div>` : ''}`;
  const d = $('#del'); if (d) d.onclick = () => actions.removeItem(state.selected);
  const f = $('#failToggle'); if (f) f.onclick = () => actions.toggleFailed(state.selected);
  const a = $('#assignToggle'); if (a) a.onclick = () => actions.toggleAssignMode(state.selected);
  box.querySelectorAll('select[data-feed]').forEach(sel => { sel.onchange = () => actions.setFeedChoice(state.selected, sel.dataset.feed, sel.value); });
}
