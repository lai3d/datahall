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

  const [json] = await Promise.all([page.waitForEvent('download'), page.locator('#layoutExport').click()]);
  expect(json.suggestedFilename()).toBe('layout.json');
  expect(JSON.parse(readFileSync((await json.path())!, 'utf8')).equipment).toHaveLength(17);
});

test('keyboard: focus stays on the button after activating it', async ({page}) => {
  await openApp(page);
  await page.locator('#utility button[data-u="5"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#utility button[data-u="5"]')).toBeFocused();
  await expect(page.locator('#utility button[data-u="5"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await layout(page)).utility).toBe(5);
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
