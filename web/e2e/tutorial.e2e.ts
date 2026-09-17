import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {clickCell, layout, openApp} from './helpers.ts';

const stepIs = (page: Page, id: string) => expect(page.locator('#tutorial')).toHaveAttribute('data-step', id);

test('first visit offers the tutorial; "Not now" hides it for good', async ({page}) => {
  await openApp(page);
  await expect(page.locator('#tutorialOffer')).toBeVisible();
  await page.locator('#tutorialDismiss').click();
  await expect(page.locator('#tutorialOffer')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#issues li').first()).toBeVisible();
  await expect(page.locator('#tutorialOffer')).toHaveCount(0);
});

test('a share-link visit does not show the tutorial offer', async ({page}) => {
  await openApp(page, '/?lang=en#layout=1,5,vr200:3.3,cdu:3.5,rpp:4.5');
  await expect(page.locator('#tutorialOffer')).toHaveCount(0);
});

test('the tutorial walks from an empty hall to a powered-on GB200 row', async ({page}) => {
  const errors = await openApp(page);
  await page.locator('#tutorialStart').click();
  await stepIs(page, 'pick');
  expect((await layout(page)).items).toEqual([]);
  await expect(page.locator('#palette button[data-t="gb200"]')).toHaveClass(/tut-target/);

  await page.locator('#palette button[data-t="gb200"]').click();
  await stepIs(page, 'place');
  await page.locator('#placeMode button[data-mode="row"]').click();
  await clickCell(page, 4, 3);
  await clickCell(page, 11, 3);
  await stepIs(page, 'why');
  await expect(page.locator('#power')).toBeDisabled();
  // The tutorial teaches adding the units by hand, so the one-click fix stays hidden
  await expect(page.locator('#repair')).toHaveCount(0);

  await page.locator('#tutorialNext').click();
  await stepIs(page, 'power');
  await expect(page.locator('#palette button[data-t="rpp"]')).toHaveClass(/tut-target/);
  await page.locator('#placeMode button[data-mode="one"]').click();
  // Two of each facility at columns 7 and 10, one row per type and each row nearer the camera than the last,
  // so no earlier rack hides the floor cell being clicked. Each unit then serves 4 racks (no per-device overload)
  const place = async (type: string, row: number) => {
    await page.locator(`#palette button[data-t="${type}"]`).click();
    for (const x of [6, 9]) await clickCell(page, x, row);
  };
  await place('rpp', 5);
  await stepIs(page, 'liquid');
  await place('cdu', 6);
  await stepIs(page, 'air');
  await place('crah', 7);
  await stepIs(page, 'network');
  await place('ib', 8);
  await stepIs(page, 'powerOn');

  await page.locator('#power').click();
  await stepIs(page, 'done');
  await expect(page.locator('#tutorial')).toContainText('576 GPUs');
  expect((await layout(page)).items).toHaveLength(16);
  await page.locator('#tutorialClose').click();
  await expect(page.locator('#tutorial')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('loading a preset ends the tutorial', async ({page}) => {
  await openApp(page);
  await page.locator('#tutorialRestart').click();
  await stepIs(page, 'pick');
  await page.locator('[data-preset="rubin"]').click();
  await expect(page.locator('#tutorial')).toHaveCount(0);
});
