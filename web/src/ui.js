// 右侧面板：市电选择、设备色板、容量仪表、问题列表、通电按钮、详情
import {CATALOG, CAT} from './catalog.js';
import {compute, fmt} from './sim.js';
import {state, itemList} from './state.js';

const $ = s => document.querySelector(s);
const UTIL = [2, 5, 10];
let actions;

export function initUI(a){
  actions = a;
  $('#utility').onclick = e => { const b = e.target.closest('button'); if (b) actions.setUtility(+b.dataset.u); };
  $('#palette').onclick = e => { const b = e.target.closest('button'); if (b) actions.setTool(b.dataset.t); };
  $('#power').onclick = () => actions.togglePower();
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => actions.loadPreset(b.dataset.preset));
}

export function buildUI(){
  $('#utility').innerHTML = UTIL.map(u => `<button type="button" data-u="${u}" aria-pressed="${u === state.utility}">${u} MW</button>`).join('');
  $('#palette').innerHTML = CATALOG.map(t => {
    const bits = [t.kw ? t.kw + ' kW' : '', t.gpus ? t.gpus + ' GPU' : '', t.liqCool ? '冷量 ' + t.liqCool + ' kW' : '',
      t.airCool ? '冷量 ' + t.airCool + ' kW' : '', t.dist ? '分配 ' + t.dist + ' kW' : '', t.ports ? t.ports + ' 端口' : ''].filter(Boolean).join('，');
    return `<button type="button" class="chip" data-t="${t.id}" aria-pressed="${state.tool === t.id}">
      <i style="background:var(${t.c})"></i><div><strong>${t.name}</strong><small>${bits}</small></div></button>`;
  }).join('');
}

function gauge(label, v, cap, cssVar){
  const pct = cap ? Math.min(100, v / cap * 100) : (v ? 100 : 0);
  const over = v > cap;
  return `<div class="gauge"><div class="top"><span>${label}</span><em style="color:${over ? 'var(--bad)' : 'inherit'}">${fmt(v)} / ${fmt(cap)}</em></div>
    <div class="bar"><i style="width:${pct}%;background:var(${over ? '--bad' : cssVar})"></i></div></div>`;
}

export function refresh(){
  const s = compute(itemList(), CAT, state.utility);
  $('#hGpu').textContent = s.gpus.toLocaleString();
  $('#hIt').textContent = fmt(s.it);
  $('#hPue').textContent = s.it ? s.pue.toFixed(2) : '–';
  $('#gauges').innerHTML =
    gauge('配电', s.it, s.dist, '--copper') +
    gauge('液冷', s.liqHeat, s.liqCap, '--coolant') +
    gauge('风冷', s.airHeat, s.airCap, '--air') +
    `<div class="gauge"><div class="top"><span>后端网络</span><em style="color:${s.gpus > s.ports ? 'var(--bad)' : 'inherit'}">${s.gpus} / ${s.ports} 端口</em></div>
      <div class="bar"><i style="width:${s.ports ? Math.min(100, s.gpus / s.ports * 100) : (s.gpus ? 100 : 0)}%;background:var(${s.gpus > s.ports ? '--bad' : '--net'})"></i></div></div>` +
    gauge('市电', s.facility, state.utility * 1000, '--ink') +
    `<div class="gauge"><div class="top"><span>硬件投入估算</span><em>约 $${s.capex.toFixed(1)}M</em></div></div>`;
  let html = s.issues.map(i => `<li class="${i.lvl}">${i.txt}</li>`).join('');
  if (!s.it) html = '<li class="warn">机房是空的。先放一个 GPU 机柜，再补齐配电、冷却和网络。</li>';
  else if (!s.blocking) html += `<li class="ok">检查通过，可以通电。</li>`;
  $('#issues').innerHTML = html;
  const btn = $('#power');
  btn.disabled = !s.it || s.blocking;
  btn.classList.toggle('on', state.powered);
  btn.textContent = state.powered ? '已通电，点击断电' : '通电';
  renderInfo();
}

export function renderInfo(){
  const box = $('#info');
  const it = state.selected && state.items.get(state.selected);
  const t = it ? CAT[it.type] : state.tool ? CAT[state.tool] : null;
  if (!t){ box.innerHTML = '点一个设备查看参数，或者从上面选设备开始摆放。'; return; }
  const rows = [];
  if (t.kw) rows.push(['功耗', t.kw + ' kW']);
  if (t.gpus) rows.push(['GPU', t.gpus]);
  if (t.kw) rows.push(['散热', t.liq ? `液冷 ${Math.round(t.liq * 100)}%` : '风冷']);
  if (t.liqCool) rows.push(['液冷能力', t.liqCool + ' kW']);
  if (t.airCool) rows.push(['风冷能力', t.airCool + ' kW']);
  if (t.dist) rows.push(['配电能力', t.dist + ' kW']);
  if (t.ports) rows.push(['GPU 端口', t.ports]);
  rows.push(['价格估算', '$' + t.cap + 'M']);
  box.innerHTML = `<strong>${t.name}</strong>${it ? `<span style="color:var(--muted)">，位置 ${it.x + 1} 列 ${it.z + 1} 排</span>` : '<span style="color:var(--muted)">，点地板空位放置</span>'}
    <table>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    <p>${t.note}</p>
    ${it ? '<div class="row" style="margin-top:8px"><button type="button" id="del">移除设备</button></div>' : ''}`;
  const d = $('#del'); if (d) d.onclick = () => actions.removeItem(state.selected);
}
