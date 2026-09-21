import {afterEach, describe, expect, it} from 'vitest';
import {billOfMaterials, buildReport} from '../src/report.ts';
import {CAT, CATALOG_VERSION} from '../src/catalog.ts';
import {MODEL_VERSION, compute, fmt} from '../src/sim.ts';
import {GRID} from '../src/grid.ts';
import {annualEnergy, DEFAULT_LOAD, DEFAULT_PRICE} from '../src/energy.ts';
import {PRESETS} from '../src/layout.ts';
import {toItems} from '../src/edit.ts';
import {DEFAULT_LANG, setLang} from '../src/i18n.ts';
import type {ReportMeta} from '../src/report.ts';
import type {Catalog, CatalogItem, Item} from '../src/types.ts';

const META: ReportMeta = {date: '2026-09-20'};
const ENERGY = {price: DEFAULT_PRICE, load: DEFAULT_LOAD};
const gb200 = toItems(PRESETS.gb200.list);
const report = (list: Item[] = gb200, CATALOG = CAT, utility = PRESETS.gb200.u, meta = META) =>
  buildReport(list, CATALOG, utility, GRID, ENERGY, meta);

afterEach(() => setLang(DEFAULT_LANG));

describe('buildReport', () => {
  it('is one self-contained HTML document with the sections the report promises', () => {
    const html = report();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    for (const id of ['summary', 'bom', 'checks', 'redundancy', 'energy', 'devices', 'assumptions'])
      expect(html, id).toMatch(new RegExp(`<section id="${id}">`));
    expect(html).toContain('<style>');
    // Nothing is fetched when the file is opened: no external stylesheet, script or image
    expect(html).not.toMatch(/<script|<link|src="(?!data:image\/)/);
  });

  it('carries the hall\'s numbers: GPUs, loads, PUE, floor and hardware estimate', () => {
    const s = compute(gb200, CAT, PRESETS.gb200.u);
    const html = report();
    expect(html).toContain(`<td class="n">${s.gpus.toLocaleString()}</td>`);   // 576 GPUs
    expect(html).toContain(`<td class="n">${fmt(s.it)}</td>`);
    expect(html).toContain(`<td class="n">${fmt(s.facility)}</td>`);
    expect(html).toContain(`<td class="n">${s.pue.toFixed(2)}</td>`);
    expect(html).toContain(`${gb200.length} of ${GRID.GW * GRID.GD} cells`);
    expect(html).toContain(`about $${s.capex.toFixed(1)}M`);
    const e = annualEnergy(s, ENERGY);
    expect(html).toContain(e.pue.toFixed(2));
    expect(html).toContain('80% average load');
  });

  it('bills the materials by device type, with counts, unit power and subtotals', () => {
    const bom = billOfMaterials(gb200, CAT);
    expect(bom.map(b => b.id)).toEqual(['gb200', 'ib', 'cdu', 'crah', 'rpp']);   // racks, network, then facilities
    expect(bom[0]).toMatchObject({count: 8, unitKw: 125, kw: 1000, capex: 24});
    // Facility units draw their equipment overhead, so a CDU is not listed as 0 kW
    expect(bom.find(b => b.id === 'cdu')).toMatchObject({count: 2, unitKw: 12, kw: 24});
    const html = report();
    expect(html).toContain('<td>GB200 NVL72</td><td class="n">8</td><td class="n">125 kW</td><td class="n">1.00 MW</td>');
    expect(html).toContain('about $24.00M');   // 8 GB200 racks at about $3M each
  });

  it('lists the bottlenecks of a hall that cannot power on, and says so at the top', () => {
    const racks: Item[] = [0, 1, 2].map(x => ({type: 'kyber', x, z: 3}));
    const html = report(racks, CAT, 2);
    expect(html).toContain('Cannot power on');
    expect(html).toContain('Not enough power distribution');
    expect(html).toContain('Not enough back-end network');
    expect(html).toContain('Over utility power');
    // Redundancy cannot be judged before the capacity check passes
    expect(html).toContain('The N+1 check runs once the capacity check passes.');
  });

  it('reports single points of failure, and N+1 when there are none', () => {
    expect(report()).toMatch(/Not N\+1 redundant/);
    expect(report()).toMatch(/CDU coolant unit \(column \d+, row \d+\): liquid cooling short/);
    expect(report(toItems(PRESETS.gb200n1.list), CAT, PRESETS.gb200n1.u)).toContain('N+1 redundant: any single CDU');
  });

  it('records the catalog and model versions and the share link', () => {
    const html = report(gb200, CAT, 2, {...META, link: 'https://example.test/?a=1&b=2#layout=1,2,gb200:0.0'});
    expect(html).toContain(`Catalog version ${CATALOG_VERSION}, capacity model ${MODEL_VERSION}`);
    expect(html).toContain('href="https://example.test/?a=1&amp;b=2#layout=1,2,gb200:0.0"');
    expect(html).toContain('2026-09-20');
  });

  it('escapes device names and notes, which are data', () => {
    const evil: CatalogItem = {...CAT.gb200, id: 'evil', name: '<b>Rack</b>',
      note: 'A note with <script>alert("x")</script> & "quotes".',
      i18n: undefined, sources: [{...CAT.gb200.sources[0], title: '<i>t</i>', publisher: 'P&Q', url: 'javascript:alert(1)'}]};
    const CATALOG: Catalog = {...CAT, evil};
    const html = buildReport([{type: 'evil', x: 0, z: 0}], CATALOG, 2, GRID, ENERGY, META);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Rack</b>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;b&gt;Rack&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;');
    expect(html).toContain('P&amp;Q: &lt;i&gt;t&lt;/i&gt;');
  });

  it('embeds only an image data URL as the screenshot, and links only http(s)', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(report(gb200, CAT, 2, {...META, shot: png})).toContain(`<img src="${png}"`);
    expect(report(gb200, CAT, 2, {...META, shot: 'data:text/html,<script>alert(1)</script>'})).not.toContain('<img');
    expect(report(gb200, CAT, 2, {...META, link: 'javascript:alert(1)'})).not.toContain('javascript:');
    expect(report()).not.toContain('<img');
  });

  it('follows the UI language and needs a generation date', () => {
    setLang('zh');
    const html = report();
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('机房架构报告');
    expect(html).toContain('设备清单');
    // @ts-expect-error missing meta must also throw at runtime
    expect(() => buildReport(gb200, CAT, 2, GRID, ENERGY)).toThrow(/meta.date/);
  });

  it('skips device types missing from the catalog', () => {
    const html = report([{type: 'nope', x: 0, z: 0}, {type: 'gb200', x: 1, z: 0}]);
    expect(html).toContain('<td>GB200 NVL72</td>');
    expect(html).not.toContain('nope');
    expect(html).toContain('1 of 160 cells');
  });

  it('plans the back-end fabric of the racks it models and says which it leaves out', () => {
    const list: Item[] = [...[0, 1, 2, 3, 4, 5, 6, 7].map(x => ({type: 'gb300', x, z: 2})), {type: 'ib', x: 0, z: 4}, {type: 'gb200', x: 0, z: 6}];
    const html = report(list, CAT, 5);
    expect(html).toContain('<section id="fabric">');
    expect(html).toContain('Oversubscription 1:1, rail-optimized.');
    expect(html).toContain('<td>Switches</td><td class="n">12</td>');
    expect(html).toContain('GB200 NVL72: not modeled.');
    expect(html).toContain('networking-docs.nvidia.com');
    expect(report(list, CAT, 5, {...META, fabric: {oversubscription: 2, railOptimized: false}})).toContain('Oversubscription 2:1, plain leaf and spine.');
    // No GPU racks, no section
    expect(report([{type: 'ib', x: 0, z: 0}], CAT, 5)).not.toContain('id="fabric"');
  });
});
