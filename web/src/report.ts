// Architecture report: one self-contained HTML file describing the current hall, built in the browser.
// Pure function, no DOM or three dependency, so it can be imported directly from node and unit-tested.
// Everything but the screenshot and the share link is recomputed here from the device list, so the report never
// depends on the panel's view state (failure drill, viewed phase): it always describes the whole hall.
// Every value that comes from data (device names, notes, source titles, the share link) goes through esc().
import {compute, fmt, MODEL_VERSION, PUE_FACTORS} from './sim.ts';
import type {Issue, Totals} from './sim.ts';
import {supplyLoads, supplyIssues} from './supply.ts';
import {blockingReasons, singlePointsOfFailure} from './redundancy.ts';
import type {Reason} from './redundancy.ts';
import {annualEnergy, fmtEnergy, fmtMoney} from './energy.ts';
import type {EnergyInputs} from './energy.ts';
import {phasesIn} from './growth.ts';
import {CABLES, CATALOG_VERSION} from './catalog.ts';
import {cableLabel, DEFAULT_FABRIC, fabricText, hallFabric, IN_RACK_M, RUN} from './fabric.ts';
import type {FabricOptions} from './fabric.ts';
import {tr, loc, catName, catNote, srcTitle, htmlLang} from './i18n.ts';
import type {Catalog, CatalogItem, Grid, Item, Source} from './types.ts';

// meta.date: generation date YYYY-MM-DD; link: the share link for this hall; shot: PNG data URL of the 3D view;
// fabric: the back-end fabric options chosen in the panel (the defaults when omitted)
export interface ReportMeta {date: string; link?: string; shot?: string; fabric?: FabricOptions}

// One row of the bill of materials: a device type, how many are in the hall, the power one draws and the totals
export interface BomRow {id: string; item: CatalogItem; count: number; unitKw: number; kw: number; capex: number}

const GROUP_ORDER = {gpu: 0, net: 1, fac: 2} as const;
// A device's own power draw: GPU, network and storage racks have IT power, facility units only equipment overhead (never both)
const unitKw = (t: CatalogItem): number => (t.kw || 0) + (t.ovh || 0);

export function billOfMaterials(list: Item[], CAT: Catalog): BomRow[]{
  const rows = new Map<string, BomRow>();
  for (const i of list){
    const t = CAT[i.type];
    if (!t) continue;
    const row = rows.get(i.type) ?? {id: i.type, item: t, count: 0, unitKw: unitKw(t), kw: 0, capex: 0};
    row.count++; row.kw += row.unitKw; row.capex += t.cap;
    rows.set(i.type, row);
  }
  return [...rows.values()].sort((a, b) =>
    GROUP_ORDER[a.item.group] - GROUP_ORDER[b.item.group] || b.count - a.count || (a.id < b.id ? -1 : 1));
}

// Text escaping for everything that comes from data; also used for attribute values, so quotes are escaped too
export const esc = (v: string | number): string => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Only inline images the app itself produced, and only links to a page: a report is opened in a browser,
// so nothing else is allowed to become a src or href
const isImageData = (s: string): boolean => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s);
const isHttpUrl = (s: string): boolean => /^https?:\/\//.test(s);

const CSS = `
:root{color-scheme:light;--ink:#1d2530;--muted:#5c6b7a;--line:#d8dee6;--bg:#f4f6f9;--card:#fff;--bad:#c0392b;--warn:#b26a00;--ok:#1d7a4c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 20px 56px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:17px;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 0}
p{margin:0 0 10px}
.meta{color:var(--muted);margin:0}
.status{display:inline-block;margin:10px 0 0;padding:3px 10px;border-radius:999px;font-weight:600}
.status.ok{background:#e4f4eb;color:var(--ok)}
.status.bad{background:#fbe6e3;color:var(--bad)}
figure{margin:16px 0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
figure img{display:block;width:100%;height:auto;border-radius:6px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tr.total td{font-weight:600;border-bottom:none}
ul{margin:0;padding-left:20px}
li{margin-bottom:6px}
li.bad{color:var(--bad)}
li.warn{color:var(--warn)}
li.ok{color:var(--ok)}
.sub,.src{color:var(--muted);font-size:13px}
.devices li{margin-bottom:12px}
footer{color:var(--muted);font-size:13px;margin-top:20px}
footer a{color:inherit;word-break:break-all}
@media print{
  body{background:#fff}
  main{max-width:none;padding:0}
  section,figure{break-inside:avoid;border-color:#ccc}
  figure img{max-height:9cm;width:auto;max-width:100%}
}
`.trim();

const row = (label: string, value: string | number): string => `<tr><td>${esc(label)}</td><td class="n">${esc(value)}</td></tr>`;
const table = (rows: string[]): string => `<table><tbody>\n${rows.join('\n')}\n</tbody></table>`;
const issueItem = (i: Issue): string => `<li class="${i.lvl}">${esc(i.txt)}</li>`;

// Reasons a capacity check fails, as short phrases (the same wording the panel uses)
const REASON_TEXT = {dist: 'reasonDist', liquid: 'reasonLiquid', air: 'reasonAir', network: 'reasonNetwork', utility: 'reasonUtility'} as const;
const reasonText = (r: Reason): string =>
  r.kind === 'overload' ? tr('reasonOverload', {label: r.item.type.toUpperCase(), loc: loc(r.item.x, r.item.z)}) : tr(REASON_TEXT[r.kind]);

const SOURCE_TYPE = {official: 'srcOfficial', reported: 'srcReported', estimate: 'srcEstimate'} as const;
// Sources behind a device's figures. Titles and publishers keep their own language; a URL is linked only when it is a web address
function sourceLine(t: {sources: Source[]}): string{
  const checked = t.sources.map(s => s.checked).sort().at(-1);
  const one = (s: Source) => {
    const label = esc(s.publisher ? `${s.publisher}: ${srcTitle(s)}` : srcTitle(s));
    const tail = esc(`(${[s.date, tr(SOURCE_TYPE[s.type])].filter(Boolean).join(', ')})`);
    return `${s.url && isHttpUrl(s.url) ? `<a href="${esc(s.url)}">${label}</a>` : label} ${tail}`;
  };
  const parts = [...t.sources.map(one), ...(checked ? [esc(tr('srcChecked', {date: checked}))] : [])];
  return `<p class="src">${esc(tr('methodSources'))} ${parts.join(esc(tr('listSep')))}</p>`;
}

function summarySection(s: Totals, list: Item[], utility: number, g: Grid, bom: BomRow[]): string{
  const cells = g.GW * g.GD, phases = phasesIn(list);
  const rows = [
    row(tr('repGpus'), s.gpus.toLocaleString()),
    row(tr('hudIt'), fmt(s.it)),
    row(tr('repFacility'), fmt(s.facility)),
    row(tr('hudPue'), s.it ? s.pue.toFixed(2) : '–'),
    row(tr('hUtility'), `${utility} MW`),
    row(tr('repFloor'), tr('repFloorValue', {used: list.length, total: cells, area: Math.round(list.length * g.CX * g.CZ)})),
    row(tr('repDevices'), list.length.toLocaleString()),
    ...(phases.length > 1 ? [row(tr('repPhases'), phases.length)] : []),
    row(tr('gaugeCapex'), tr('capex', {m: bom.reduce((n, b) => n + b.capex, 0).toFixed(1)})),
  ];
  return `<section id="summary"><h2>${esc(tr('repHSummary'))}</h2>${table(rows)}</section>`;
}

function bomSection(bom: BomRow[]): string{
  const head = ['repColDevice', 'repColCount', 'repColUnit', 'repColSubtotal', 'repColCost'] as const;
  const body = bom.map(b => `<tr><td>${esc(catName(b.item))}</td><td class="n">${esc(b.count)}</td>` +
    `<td class="n">${esc(b.unitKw ? fmt(b.unitKw) : '–')}</td><td class="n">${esc(b.kw ? fmt(b.kw) : '–')}</td>` +
    `<td class="n">${esc(tr('capex', {m: b.capex.toFixed(2)}))}</td></tr>`);
  const totals = bom.reduce((a, b) => ({n: a.n + b.count, kw: a.kw + b.kw, capex: a.capex + b.capex}), {n: 0, kw: 0, capex: 0});
  const total = `<tr class="total"><td>${esc(tr('repTotal'))}</td><td class="n">${esc(totals.n)}</td><td class="n"></td>` +
    `<td class="n">${esc(fmt(totals.kw))}</td><td class="n">${esc(tr('capex', {m: totals.capex.toFixed(1)}))}</td></tr>`;
  return `<section id="bom"><h2>${esc(tr('repHBom'))}</h2><table><thead><tr>` +
    head.map((k, i) => `<th${i ? ' class="n"' : ''}>${esc(tr(k))}</th>`).join('') +
    `</tr></thead><tbody>\n${body.join('\n')}\n${total}\n</tbody></table>` +
    `<p class="sub">${esc(tr('repBomNote'))}</p></section>`;
}

function checksSection(s: Totals, perDevice: Issue[], blocked: boolean): string{
  const items = [...s.issues, ...perDevice].map(issueItem);
  if (!blocked) items.push(`<li class="ok">${esc(tr('issueOk'))}</li>`);
  return `<section id="checks"><h2>${esc(tr('repHChecks'))}</h2><ul>\n${items.join('\n')}\n</ul></section>`;
}

function redundancySection(list: Item[], CAT: Catalog, utility: number): string{
  const spof = singlePointsOfFailure(list, CAT, utility);
  const items = spof === null ? [`<li class="warn">${esc(tr('n1Blocked'))}</li>`]
    : !spof.length ? [`<li class="ok">${esc(tr('n1Ok'))}</li>`]
    : [`<li class="warn">${esc(tr('n1Bad', {n: spof.length}))}</li>`,
      ...spof.map(r => `<li class="warn">${esc(tr('n1Item', {name: catName(CAT[r.item.type]), loc: loc(r.item.x, r.item.z),
        reasons: r.reasons.map(reasonText).join(tr('listSep'))}))}</li>`)];
  return `<section id="redundancy"><h2>${esc(tr('repHRedundancy'))}</h2><ul>\n${items.join('\n')}\n</ul></section>`;
}

function energySection(s: Totals, energy: EnergyInputs): string{
  const e = annualEnergy(s, energy);
  const rows = [
    row(tr('rowItEnergy'), fmtEnergy(e.itMWh)),
    row(tr('rowOverheadEnergy'), fmtEnergy(e.overheadMWh)),
    row(tr('rowTotalEnergy'), fmtEnergy(e.totalMWh)),
    row(tr('rowAnnualPue'), e.pue.toFixed(2)),
    row(tr('rowCost'), fmtMoney(e.cost)),
  ];
  return `<section id="energy"><h2>${esc(tr('hEnergy'))}</h2>${table(rows)}` +
    `<p class="sub">${esc(tr('repEnergyInputs', {rate: energy.price, pct: Math.round(energy.load * 100)}))}</p></section>`;
}

// Back-end fabric, with the same rows as the panel; a hall without a modeled fabric only says which racks are left out
function fabricSection(list: Item[], CAT: Catalog, opts: FabricOptions): string{
  const f = hallFabric(list, CAT, CABLES, opts);
  if (!f.modeled.length && !f.skipped.length) return '';
  const text = fabricText(f, CAT, CABLES);
  const items = [
    ...(text.status ? [`<li class="${text.status.lvl}">${esc(text.status.txt)}</li>`] : []),
    ...text.skipped.map(s => `<li>${esc(s)}</li>`),
  ];
  const cables = CABLES.filter(c => text.rows.length && f.switchType && c.gbps === CAT[f.switchType]!.portGbps)
    .map(c => `<li><strong>${esc(cableLabel(c))}</strong>${sourceLine(c)}</li>`);
  return `<section id="fabric"><h2>${esc(tr('repHFabric'))}</h2>` +
    (text.rows.length ? `<p class="sub">${esc(tr('repFabricOptions', {r: opts.oversubscription, rails: tr(opts.railOptimized ? 'repRailsOn' : 'repRailsOff')}))}</p>` +
      table(text.rows.map(([k, v]) => row(k, v))) : '') +
    (items.length ? `<ul>\n${items.join('\n')}\n</ul>` : '') +
    (text.rows.length ? `<p class="sub">${esc(tr('fabricNote', {rise: RUN.riseM, slack: RUN.slackM, inRack: IN_RACK_M}))}</p>` : '') +
    (cables.length ? `<ul class="devices">\n${cables.join('\n')}\n</ul>` : '') + '</section>';
}

function devicesSection(bom: BomRow[]): string{
  const items = bom.map(b => `<li><strong>${esc(catName(b.item))}</strong> ${esc(catNote(b.item))}${sourceLine(b.item)}</li>`);
  return `<section id="devices"><h2>${esc(tr('mHDevices'))}</h2><p class="sub">${esc(tr('mDevicesIntro'))}</p>` +
    `<ul class="devices">\n${items.join('\n')}\n</ul></section>`;
}

// The limits the methodology dialog states, quoted from the same strings so the report cannot drift from it
function assumptionsSection(): string{
  const {liquid, air, losses} = PUE_FACTORS, f = (n: number) => n.toFixed(2);
  const paras = [
    tr('mIntro'), tr('mPerDevice'), tr('mPueFormula', {liq: f(liquid), air: f(air), loss: f(losses)}),
    tr('mPueLeaves'), tr('mCost'), tr('mEnergy'), tr('mPlanning'), tr('mFabricLeaves'),
  ];
  return `<section id="assumptions"><h2>${esc(tr('repHAssumptions'))}</h2>\n` +
    paras.map(p => `<p>${esc(p)}</p>`).join('\n') + '</section>';
}

export function buildReport(list: Item[], CAT: Catalog, utility: number, g: Grid, energy: EnergyInputs, meta: ReportMeta): string{
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta?.date || '')) throw new Error('buildReport: meta.date must be YYYY-MM-DD');
  const placed = list.filter(i => CAT[i.type]);
  const s = compute(placed, CAT, utility);
  const perDevice = supplyIssues(supplyLoads(placed, CAT), s);
  const problems = blockingReasons(placed, CAT, utility);
  const bom = billOfMaterials(placed, CAT);
  const status = problems.length
    ? `<p class="status bad">${esc(tr('barBlocked', {n: problems.length}))}</p>`
    : `<p class="status ok">${esc(tr('barReady'))}</p>`;
  const shot = meta.shot && isImageData(meta.shot)
    ? `<figure><img src="${esc(meta.shot)}" alt="${esc(tr('repViewAlt'))}"></figure>` : '';
  const link = meta.link && isHttpUrl(meta.link)
    ? `<p>${esc(tr('repLink'))} <a href="${esc(meta.link)}">${esc(meta.link)}</a></p>` : '';
  return `<!doctype html>
<html lang="${esc(htmlLang())}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tr('repTitle'))}</title>
<style>
${CSS}
</style>
</head>
<body>
<main>
<header>
<h1>${esc(tr('repTitle'))}</h1>
<p class="meta">${esc(tr('repGenerated', {date: meta.date}))}</p>
${status}
</header>
${shot}
${summarySection(s, placed, utility, g, bom)}
${bomSection(bom)}
${checksSection(s, perDevice, problems.length > 0)}
${redundancySection(placed, CAT, utility)}
${energySection(s, energy)}
${fabricSection(placed, CAT, meta.fabric ?? DEFAULT_FABRIC)}
${devicesSection(bom)}
${assumptionsSection()}
<footer>
<p>${esc(tr('mVersions', {catalog: CATALOG_VERSION, model: MODEL_VERSION}))}</p>
${link}
<p>${esc(tr('foot'))}</p>
</footer>
</main>
</body>
</html>
`;
}
