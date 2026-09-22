// Shared helpers for the smoke tests. Layout assertions read the share-link hash in the address bar,
// which always mirrors the current hall, instead of reaching into app state.
import {expect} from '@playwright/test';
import type {Page} from '@playwright/test';

declare global {
  interface Window {
    __datahall?: {
      cellToScreen(x: number, z: number, y?: number): {x: number; y: number}; renderOnce(): void;
      meters(): Record<string, {lit: number; level: string}>; flowDots(): number;
    };
  }
}

// Open the app with a clean localStorage and wait until the panel and 3D view are ready.
// Collects page errors and console errors so each test can assert there were none.
export async function openApp(page: Page, path = '/?lang=en'): Promise<string[]>{
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon\.ico/.test(m.text()) && !/Failed to load resource.*404/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?lang=en');
  await page.evaluate(() => localStorage.clear());
  // A real navigation, so a path that only adds a hash still reloads the page
  await page.goto('about:blank');
  await page.goto(path);
  await expect(page.locator('#issues li').first()).toBeVisible();
  await page.waitForFunction(() => !!window.__datahall);
  return errors;
}

// Screen position of a grid cell (y = height above the floor in meters), after rendering a frame
// so the camera matrices are current even when the tab is in the background.
export async function cellPoint(page: Page, x: number, z: number, y = 0): Promise<{x: number; y: number}>{
  return page.evaluate(([x, z, y]) => { const d = window.__datahall!; d.renderOnce(); return d.cellToScreen(x, z, y); }, [x, z, y]);
}

export async function clickCell(page: Page, x: number, z: number, y = 0): Promise<void>{
  const p = await cellPoint(page, x, z, y);
  await page.mouse.click(p.x, p.y);
}

// Rack tops are at about 2.2 m; clicking just below the top picks that rack rather than one in front of it
export const clickTop = (page: Page, x: number, z: number) => clickCell(page, x, z, 2.15);

// Decode the layout part of the #layout= hash into "type@x,z" strings, plus the manual feed and phase
// groups as raw strings. Independent of the app's own decoder on purpose.
export async function layout(page: Page): Promise<{version: number; utility: number; items: string[]; extra: string[]}>{
  const hash = await page.evaluate(() => location.hash);
  const raw = new URLSearchParams(hash.replace(/^#/, '')).get('layout') ?? '';
  const [version, utility, ...groups] = raw.split(',');
  const items: string[] = [], extra: string[] = [];
  for (const g of groups){
    if (g.startsWith('@')){ extra.push(g); continue; }
    const [type, cells = ''] = g.split(':');
    for (const c of cells.split('-').filter(Boolean)){ const [x, z] = c.split('.'); items.push(`${type}@${x},${z}`); }
  }
  return {version: Number(version), utility: Number(utility), items: items.sort(), extra};
}

// Opens one of the panel groups below the builder (learn, design, drill); their sections are hidden otherwise
export async function openMode(page: Page, mode: 'learn' | 'design' | 'drill'): Promise<void>{
  await page.locator(`#modes button[data-mode="${mode}"]`).click();
}
