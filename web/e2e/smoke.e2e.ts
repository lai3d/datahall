import {expect, test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {cellPoint, clickCell, clickTop, layout, openApp} from './helpers.ts';

// Default layout: the GB200 preset (8 racks in row 3, facilities in row 5), utility 2 MW
const GB200_COUNT = 16;

test('loads in English with a passing capacity check and no errors', async ({page}) => {
  const errors = await openApp(page);
  await expect(page).toHaveTitle('GPU data hall builder');
  await expect(page.locator('#issues')).toContainText('All checks pass');
  await expect(page.locator('#hGpu')).toHaveText('576');
  await expect(page.locator('#growth tbody tr')).toHaveCount(1);
  await expect(page.locator('#n1')).toContainText('Not N+1 redundant');
  const canvas = await page.locator('#stage canvas').boundingBox();
  expect(canvas!.width).toBeGreaterThan(600);
  // The stage bar and panel bar are for narrow screens only
  await expect(page.locator('#panelBar')).toBeHidden();
  expect((await layout(page)).items).toHaveLength(GB200_COUNT);
  expect(errors).toEqual([]);
});

test('switches to Chinese and remembers it after reload', async ({page}) => {
  await openApp(page);
  await page.locator('#lang button[data-lang="zh"]').click();
  await expect(page.locator('h1')).toHaveText('GPU 机房搭建模拟器');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('GPU 机房搭建模拟器');
});

test('places a device, then undo and redo', async ({page}) => {
  await openApp(page);
  await page.locator('#palette button[data-t="rpp"]').click();
  await clickCell(page, 1, 9);
  expect((await layout(page)).items).toContain('rpp@1,9');
  await page.locator('#undo').click();
  expect((await layout(page)).items).not.toContain('rpp@1,9');
  await page.locator('#redo').click();
  expect((await layout(page)).items).toContain('rpp@1,9');
});

test('places a whole row with two clicks', async ({page}) => {
  await openApp(page);
  await page.locator('#palette button[data-t="crah"]').click();
  await page.locator('#placeMode button[data-mode="row"]').click();
  await clickCell(page, 2, 9);
  await expect(page.locator('#placeHint')).toContainText('last cell');
  await clickCell(page, 9, 9);
  const row = (await layout(page)).items.filter(i => i.startsWith('crah@') && i.endsWith(',9'));
  expect(row).toHaveLength(8);
});

test('drags a rack to another row and undoes it', async ({page}) => {
  await openApp(page);
  const before = await layout(page);
  const grab = await cellPoint(page, 8, 3, 2.15), from = await cellPoint(page, 8, 3), to = await cellPoint(page, 8, 8);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(grab.x + (to.x - from.x) * i / 10, grab.y + (to.y - from.y) * i / 10);
  await page.mouse.up();
  // One rack left row 3 and landed on another empty cell (where exactly depends on perspective)
  const after = await layout(page);
  const racks = after.items.filter(i => i.startsWith('gb200@'));
  expect(racks).toHaveLength(8);
  expect(racks.filter(i => i.endsWith(',3'))).toHaveLength(7);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await layout(page)).items).toEqual(before.items);
});

test('failure drill: failing a CDU breaks liquid cooling, restore brings it back', async ({page}) => {
  await openApp(page);
  await clickTop(page, 5, 5);
  await expect(page.locator('#failToggle')).toHaveText('Mark failed');
  await page.keyboard.press('f');
  await expect(page.locator('#issues')).toContainText('Failure drill: 1 device');
  await expect(page.locator('#issues')).toContainText('Not enough liquid cooling');
  await expect(page.locator('#power')).toBeDisabled();
  await page.locator('#drillRestoreAll').click();
  await expect(page.locator('#issues')).toContainText('All checks pass');
});

test('manual supply assignment is written to the share link', async ({page}) => {
  await openApp(page);
  await clickTop(page, 6, 3);
  const select = page.locator('#info select[data-feed="coolantSource"]');
  await expect(select).toBeVisible();
  const options = await select.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value));
  const manual = options.find(v => v !== 'auto')!;
  await select.selectOption(manual);
  const l = await layout(page);
  expect(l.version).toBe(2);
  expect(l.extra.some(g => g.startsWith('@c:'))).toBe(true);
});

test('opens a share link with a layout', async ({page}) => {
  await openApp(page, '/?lang=en#layout=1,5,vr200:3.3-4.3,cdu:3.5,rpp:4.5');
  await expect(page.locator('#shareMsg')).toContainText('Loaded 4 devices from the share link, utility 5 MW');
  expect((await layout(page)).items).toEqual(['cdu@3,5', 'rpp@4,5', 'vr200@3,3', 'vr200@4,3']);
});

test('a corrupt saved layout still loads the page, keeping the valid devices', async ({page}) => {
  // Opened without a share link hash, so the saved layout is what loads
  const errors = await openApp(page);
  await page.evaluate(() => localStorage.setItem('dchall.v1', JSON.stringify({u: 3, list: [null, ['vr200', 3, 3], ['vr200', 'x', 3], ['nope', 1, 1], ['cdu', 3, 5, {phase: 99}]]})));
  await page.goto('about:blank');
  await page.goto('/?lang=en');
  await expect(page.locator('#issues li').first()).toBeVisible();
  expect((await layout(page)).items).toEqual(['cdu@3,5', 'vr200@3,3']);
  await page.evaluate(() => localStorage.setItem('dchall.v1', '{not json'));
  await page.goto('about:blank');
  await page.goto('/?lang=en');
  await expect(page.locator('#issues li').first()).toBeVisible();
  expect((await layout(page)).items).toHaveLength(GB200_COUNT);
  expect(errors).toEqual([]);
});

test('rack comparison follows the utility feed, and the HUD shows a scale reference', async ({page}) => {
  const errors = await openApp(page);
  await expect(page.locator('#hScale')).toHaveText('≈ 4,400 DGX Sparks or 870 US homes');
  await expect(page.locator('#compare .cmp[data-t="gb200"]')).toContainText('12 racks, 864 GPUs');
  await expect(page.locator('#compare .cmp[data-t="gb200"]')).toHaveAttribute('aria-current', 'true');
  await page.locator('#utility button[data-u="5"]').click();
  await expect(page.locator('#compare .cmp[data-t="gb200"]')).toContainText('31 racks, 2,232 GPUs');
  await expect(page.locator('#compare .cmp[data-t="kyber"]')).toContainText('7 racks, 1,008 GPUs');
  expect(errors).toEqual([]);
});

test('load meters on CDUs and RPPs follow the load, and power flows along the links when powered on', async ({page}) => {
  const errors = await openApp(page, '/?lang=en#layout=1,5,vr200:3.3-4.3,cdu:3.5,rpp:4.5,ib:5.5,crah:6.5');
  const meters = () => page.evaluate(() => window.__datahall!.meters());
  // Two Vera Rubin racks and an IB rack: 361 kW of liquid heat on an 800 kW CDU, 404 kW on an 800 kW RPP
  expect(await meters()).toMatchObject({'3,5': {lit: 3, level: 'ok'}, '4,5': {lit: 3, level: 'ok'}});
  expect(await page.evaluate(() => window.__datahall!.flowDots())).toBe(0);
  await page.locator('#power').click();
  expect(await page.evaluate(() => { window.__datahall!.renderOnce(); return window.__datahall!.flowDots(); })).toBeGreaterThan(0);
  await page.locator('#power').click();
  expect(await page.evaluate(() => { window.__datahall!.renderOnce(); return window.__datahall!.flowDots(); })).toBe(0);
  // Five racks overload both
  await page.goto('about:blank');
  await page.goto('/?lang=en#layout=1,5,vr200:0.3-1.3-2.3-3.3-4.3,cdu:2.5,rpp:3.5');
  await page.waitForFunction(() => !!window.__datahall);
  expect(await meters()).toMatchObject({'2,5': {lit: 5, level: 'bad'}, '3,5': {lit: 5, level: 'bad'}});
  expect(errors).toEqual([]);
});

test('annual energy: price and average load change the yearly cost and are remembered', async ({page}) => {
  const errors = await openApp(page);
  // GB200 preset at the default 8.62 ¢/kWh and 80% load
  await expect(page.locator('#energyCost')).toHaveText('$773K');
  await page.locator('#energyPrice').fill('0.12');
  await page.locator('#energyLoad').fill('60');
  await expect(page.locator('#energyCost')).toHaveText('$819K');
  await expect(page.locator('#energy')).toContainText('Annual PUE1.24');
  await page.reload();
  await expect(page.locator('#energyPrice')).toHaveValue('0.12');
  await expect(page.locator('#energyCost')).toHaveText('$819K');
  expect(errors).toEqual([]);
});

test('ownership estimate: the period and the maintenance assumption change the total and are remembered', async ({page}) => {
  const errors = await openApp(page);
  // GB200 preset: $27.16M of hardware, three years of electricity at the default price, plus 5% of hardware a year
  await expect(page.locator('#ownershipTotal')).toHaveText('$33.55M');
  await page.locator('#ownershipYears').selectOption('5');
  await expect(page.locator('#ownershipTotal')).toHaveText('$37.82M');
  await page.locator('#ownershipMaint').fill('0');
  await expect(page.locator('#ownershipTotal')).toHaveText('$31.03M');
  // The band says what the estimate is worth: it brackets the total
  await expect(page.locator('#ownershipBand')).toContainText('lands between');
  await page.reload();
  await expect(page.locator('#ownershipYears')).toHaveValue('5');
  await expect(page.locator('#ownershipMaint')).toHaveValue('0');
  await expect(page.locator('#ownershipTotal')).toHaveText('$31.03M');
  expect(errors).toEqual([]);
});

test('methodology dialog opens from the header and from section links, and closes with Esc', async ({page}) => {
  const errors = await openApp(page);
  await page.locator('#methodOpen').click();
  const dialog = page.locator('#method');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#m-pue .formula')).toContainText('liquid-cooled heat × 0.08 + air-cooled heat × 0.30 + IT × 0.05');
  await expect(dialog.locator('#m-checks')).toContainText('800 kW each');
  await expect(dialog.locator('#m-devices li[data-t="vr200"]')).toContainText('Vera Rubin NVL72');
  // Every device lists its sources, with links for everything that is not this project's own estimate
  await expect(dialog.locator('#m-devices li[data-t="vr200"] .sources a')).toHaveCount(4);
  await expect(dialog.locator('#m-devices li[data-t="vr200"] .sources')).toContainText('range in sources: power 190–230 kW, estimated price $5–7M');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.locator('button[data-method="planning"]').click();
  await expect(dialog.locator('#m-planning')).toBeInViewport();
  await page.locator('#methodClose').click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('repair suggestion: one click adds the missing units, and undo takes them away', async ({page}) => {
  const errors = await openApp(page, '/?lang=en#layout=1,2,gb200:4.3-5.3-6.3-7.3-8.3-9.3-10.3-11.3');
  await expect(page.locator('#repair')).toContainText('Add 2 RPPs, 2 CDUs, 2 in-row coolers and 2 IB switch racks.');
  await page.locator('#repairApply').click();
  await expect(page.locator('#issues')).toContainText('All checks pass');
  await expect(page.locator('#repair')).toHaveCount(0);
  expect((await layout(page)).items).toHaveLength(16);
  await page.locator('#undo').click();
  expect((await layout(page)).items).toHaveLength(8);
  await expect(page.locator('#repair')).toBeVisible();
  expect(errors).toEqual([]);
});

test('repair suggestion: when the feed is the limit, raise it or remove racks instead', async ({page}) => {
  const racks = Array.from({length: 16}, (_, x) => `${x}.3`).join('-');
  const errors = await openApp(page, `/?lang=en#layout=1,2,vr200:${racks}`);
  await expect(page.locator('#repair .repair-option[data-option="0"]')).toContainText('Raise the utility feed to 5 MW, then add');
  await expect(page.locator('#repair .repair-option[data-option="1"]')).toContainText('Or: Remove 8 × Vera Rubin NVL72 from the end of the rows, then add');
  await page.locator('#repairApplyAlt').click();
  await expect(page.locator('#issues')).toContainText('All checks pass');
  const l = await layout(page);
  expect(l.utility).toBe(2);
  expect(l.items.filter(i => i.startsWith('vr200@'))).toHaveLength(8);
  expect(errors).toEqual([]);
});

test('start from a goal: generates a hall that passes, explains the limit, and can be undone', async ({page}) => {
  const errors = await openApp(page);
  const before = (await layout(page)).items;
  await page.locator('#goalType').selectOption('gb200');
  await page.locator('#goalGpus').fill('576');
  await page.locator('#goalUtility').selectOption('2');
  await page.locator('#goalGenerate').click();
  await expect(page.locator('#goalMsg')).toHaveText('Placed 8 × GB200 NVL72 (576 GPUs) with 2 RPPs, 2 CDUs, 2 in-row coolers and 2 IB switch racks.');
  await expect(page.locator('#issues')).toContainText('All checks pass');
  expect((await layout(page)).items.filter(i => i.startsWith('gb200@'))).toHaveLength(8);

  await page.locator('#goalType').selectOption('vr200');
  await page.locator('#goalGpus').fill('2000');
  await page.locator('#goalUtility').selectOption('5');
  await page.locator('#goalN1').check();
  await page.locator('#goalGenerate').click();
  await expect(page.locator('#goalMsg')).toContainText('but a 5 MW feed runs at most 21 of these racks');
  await expect(page.locator('#n1')).toContainText('N+1 redundant:');
  expect((await layout(page)).utility).toBe(5);

  await page.locator('#undo').click();
  await page.locator('#undo').click();
  expect((await layout(page)).items).toEqual(before);
  await expect(page.locator('#goalMsg')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('scenario: fix the bare rack row, power on, and read the conclusion', async ({page}) => {
  const errors = await openApp(page);
  await page.locator('#scenarios button[data-scenario="powerOn"]').click();
  await expect(page.locator('#scenario')).toContainText('Eight GB200 racks are on the floor');
  expect((await layout(page)).items).toHaveLength(8);
  await page.locator('#repairApply').click();
  await expect(page.locator('#scenario')).not.toHaveAttribute('data-done', 'true');
  await page.locator('#power').click();
  await expect(page.locator('#scenario')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('#scenario')).toContainText('Powered on: 576 GPUs');
  await page.locator('#scenarioExit').click();
  await expect(page.locator('#scenario')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('scenario: rebuild the same feed with newer racks using the goal generator', async ({page}) => {
  const errors = await openApp(page);
  await page.locator('#scenarios button[data-scenario="sameFeed"]').click();
  await expect(page.locator('#scenario')).toContainText('largest GB200 hall a 2 MW feed can run');
  await page.locator('#goalType').selectOption('vr200');
  await page.locator('#goalGpus').fill('2000');
  await page.locator('#goalUtility').selectOption('2');
  await page.locator('#goalGenerate').click();
  // Generating from a goal is part of this lesson, so it does not leave the scenario
  await expect(page.locator('#scenario')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('#scenario')).toContainText('On the same 2 MW feed: 8 Vera Rubin racks with 576 GPUs, against 12 GB200 racks with 864 GPUs.');
  expect(errors).toEqual([]);
});

test('repair suggestion: while viewing a phase, the new units join that phase', async ({page}) => {
  // Phase 1 has eight bare racks; phase 2 adds two more. Viewing phase 1 and applying must fix phase 1 itself
  const errors = await openApp(page, '/?lang=en#layout=3,2,gb200:4.3-5.3-6.3-7.3-8.3-9.3-10.3-11.3-12.3-13.3,@2:12.3-13.3');
  // New devices are set to go into phase 2, but the repair is for phase 1, so its units must land in phase 1
  await page.locator('#placePhase button[data-phase="2"]').click();
  await page.locator('#viewPhase button[data-phase="1"]').click();
  await page.locator('#repairApply').click();
  await expect(page.locator('#growth tbody tr[data-phase="1"]')).toContainText('OK');
  await expect(page.locator('#issues')).toContainText('All checks pass');
  expect(errors).toEqual([]);
});

test('growth plan: moving a rack to phase 2 adds a phase row', async ({page}) => {
  await openApp(page);
  await clickTop(page, 6, 3);
  await page.locator('#itemPhase').selectOption('2');
  await expect(page.locator('#growth tbody tr')).toHaveCount(2);
  expect((await layout(page)).extra).toContain('@2:6.3');
  await page.locator('#growth tbody tr[data-phase="1"]').click();
  await expect(page.locator('#issues')).toContainText('Showing the hall as of phase 1');
});

test('imports the sample .usda and exports OpenUSD and layout.json', async ({page}) => {
  await openApp(page);
  await page.locator('#usdFile').setInputFiles(new URL('../../samples/datahall.usda', import.meta.url).pathname);
  await expect(page.locator('#usdMsg')).toContainText('Imported 17 devices from datahall.usda, utility 5 MW');

  const [usd] = await Promise.all([page.waitForEvent('download'), page.locator('#usdExport').click()]);
  expect(usd.suggestedFilename()).toBe('datahall.usda');
  const usda = readFileSync((await usd.path())!, 'utf8');
  expect(usda.startsWith('#usda 1.0')).toBe(true);
  expect(usda.match(/def Xform "R\d\d_C\d\d"/g)).toHaveLength(17);
  // Provenance: both exports identify the catalog and model behind the figures
  expect(usda).toMatch(/string "dchall:catalogVersion" = "\d{4}-\d{2}-\d{2}"/);
  expect(usda).toMatch(/string "dchall:modelVersion" = "[^"]+"/);

  const [json] = await Promise.all([page.waitForEvent('download'), page.locator('#layoutExport').click()]);
  expect(json.suggestedFilename()).toBe('layout.json');
  const layoutJson = JSON.parse(readFileSync((await json.path())!, 'utf8'));
  expect(layoutJson.equipment).toHaveLength(17);
  expect(layoutJson.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(layoutJson.modelVersion).toBeTruthy();
  await page.locator('#methodOpen').click();
  await expect(page.locator('#methodVersions')).toContainText(`Catalog version ${layoutJson.catalogVersion}, capacity model ${layoutJson.modelVersion}`);
});

test('exports a self-contained architecture report', async ({page}) => {
  const errors = await openApp(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#reportExport').click()]);
  expect(download.suggestedFilename()).toBe('datahall-report.html');
  const html = readFileSync((await download.path())!, 'utf8');
  expect(html).toContain('Data hall architecture report');
  expect(html).toContain('576');                                  // GPUs of the default GB200 preset
  expect(html).toMatch(/Catalog version \d{4}-\d{2}-\d{2}, capacity model [^.]+\./);
  expect(html).toContain('<img src="data:image/png;base64,');     // the 3D view travels inside the file
  expect(html).not.toMatch(/<script|<link/);                      // self-contained: nothing is fetched when it opens
  expect(html.trimEnd().endsWith('</html>')).toBe(true);
  await expect(page.locator('#usdMsg')).toContainText('Exported datahall-report.html');
  expect(errors).toEqual([]);
});

test('keyboard: focus stays on the button after activating it', async ({page}) => {
  await openApp(page);
  await page.locator('#utility button[data-u="5"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#utility button[data-u="5"]')).toBeFocused();
  await expect(page.locator('#utility button[data-u="5"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await layout(page)).utility).toBe(5);
});

test('saves the 3D view as a PNG image', async ({page}) => {
  const errors = await openApp(page);
  const button = page.locator('#imageSave');
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^datahall-\d{4}-\d{2}-\d{2}\.png$/);
  const png = readFileSync(await download.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  // A blank canvas compresses to a few hundred bytes; the rendered hall is far larger
  expect(png.length).toBeGreaterThan(20_000);
  await expect(page.locator('#shareMsg')).toContainText('Saved the 3D view');
  expect(errors).toEqual([]);
});

test('powers on and off', async ({page}) => {
  await openApp(page);
  await page.locator('#power').click();
  await expect(page.locator('#power')).toHaveText('Powered on, click to power off');
  await page.locator('#power').click();
  await expect(page.locator('#power')).toHaveText('Power on');
});

test('mobile: loads without horizontal scrolling and the panel is reachable @mobile', async ({page}) => {
  const errors = await openApp(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator('#power').scrollIntoViewIfNeeded();
  await expect(page.locator('#power')).toBeVisible();
  await expect(page.locator('#issues')).toContainText('All checks pass');
  expect(errors).toEqual([]);
});

test('mobile: tap placement shows feedback on the stage, and the selected device can be removed there @mobile', async ({page}) => {
  const errors = await openApp(page);
  await page.locator('#palette button[data-t="rpp"]').click();
  await expect(page.locator('#stageBar')).toContainText('Placing RPP');
  const p = await cellPoint(page, 2, 8);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.locator('#stageBar')).toContainText('Placed RPP');
  expect((await layout(page)).items).toContain('rpp@2,8');
  await page.locator('#barDone').click();
  await expect(page.locator('#stageBar')).toBeHidden();
  const top = await cellPoint(page, 2, 8, 1.2);
  await page.touchscreen.tap(top.x, top.y);
  await expect(page.locator('#stageBar')).toContainText('column 3, row 9');
  await page.locator('#barRemove').click();
  expect((await layout(page)).items).not.toContain('rpp@2,8');
  await expect(page.locator('#stageBar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('mobile: the panel folds away to give the 3D view the screen @mobile', async ({page}) => {
  const errors = await openApp(page);
  await expect(page.locator('#panelStatus')).toHaveText('All checks pass');
  const before = (await page.locator('#stage').boundingBox())!.height;
  await page.locator('#panelToggle').click();
  await expect(page.locator('#panelToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#power')).toBeHidden();
  expect((await page.locator('#stage').boundingBox())!.height).toBeGreaterThan(before * 1.5);
  await page.locator('#panelToggle').click();
  await expect(page.locator('#power')).toBeAttached();
  await page.locator('#power').scrollIntoViewIfNeeded();
  await expect(page.locator('#power')).toBeVisible();
  expect(errors).toEqual([]);
});
