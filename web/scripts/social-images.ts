// Regenerates the social preview image (public/og.png, 1200 × 630) and the Apple touch icon
// (public/apple-touch-icon.png, 180 × 180, rendered from public/favicon.svg).
// Run after visible changes to the 3D view: npm run social-images
// Builds the app in e2e mode (for the window.__datahall hook), serves it with vite preview and captures
// the Vera Rubin preset in the dark theme. Needs network access for the web font.
import {execSync, spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {encodeLayout} from '../src/share-link.ts';
import {PRESETS} from '../src/layout.ts';

const PORT = 4179, W = 1200, H = 630;
const web = new URL('..', import.meta.url).pathname;

execSync('npx vite build --mode e2e --outDir dist-e2e', {cwd: web, stdio: 'inherit'});
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {cwd: web, stdio: 'ignore'});
const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
try {
  for (let i = 0; ; i++){
    try { await fetch(`http://localhost:${PORT}`); break; } catch (e) { if (i > 100) throw e; await new Promise(r => setTimeout(r, 200)); }
  }
  // The stage is the viewport minus the 380 px panel, so this makes the 3D view exactly W × H (rendered at 2×)
  const context = await browser.newContext({viewport: {width: W + 380, height: H}, deviceScaleFactor: 2, colorScheme: 'dark'});
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/?lang=en#${encodeLayout(PRESETS.rubin)}`);
  await page.waitForFunction(() => !!(window as {__datahall?: unknown}).__datahall);
  await page.locator('#power').click();
  const view = await page.evaluate(() => {
    (window as unknown as {__datahall: {renderOnce(): void}}).__datahall.renderOnce();
    return document.querySelector<HTMLCanvasElement>('#stage canvas')!.toDataURL('image/png');
  });

  // The hall fills only the middle of the default view: enlarge it and move it right of the text
  const ZOOM = 1.75, CENTER = {x: 0.52, y: 0.48}, TARGET = {x: 850, y: 335};
  const bg = {w: W * ZOOM, h: H * ZOOM};
  const pos = {x: TARGET.x - CENTER.x * bg.w, y: TARGET.y - CENTER.y * bg.h};
  const card = await (await browser.newContext({viewport: {width: W, height: H}})).newPage();
  await card.setContent(`<!doctype html>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;700&display=swap" rel="stylesheet">
<style>
  body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0D1318 url(${view}) ${pos.x}px ${pos.y}px/${bg.w}px ${bg.h}px no-repeat;font-family:"Barlow Semi Condensed",sans-serif;color:#E4EAEF}
  .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(13,19,24,.95) 0%,rgba(13,19,24,.8) 34%,rgba(13,19,24,0) 50%)}
  .text{position:absolute;left:60px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center}
  h1{margin:0;font-size:76px;line-height:.95;font-weight:700;letter-spacing:.5px}
  h1 b{color:#76B900}
  p{margin:22px 0 0;font-size:30px;line-height:1.25;font-weight:500;color:#C3CDD5}
</style>
<div class="shade"></div>
<div class="text"><h1><b>GPU</b><br>data hall<br>builder</h1><p>Place GB300 and Vera Rubin NVL72 racks, then add the power, cooling and networking to switch them on</p></div>`);
  await card.evaluate(() => document.fonts.ready);
  await card.screenshot({path: `${web}public/og.png`});

  const svg = readFileSync(`${web}public/favicon.svg`, 'utf8');
  await card.setViewportSize({width: 180, height: 180});
  await card.setContent(`<style>body{margin:0}svg{display:block;width:180px;height:180px}</style>${svg}`);
  await card.screenshot({path: `${web}public/apple-touch-icon.png`});
  console.log('public/og.png and public/apple-touch-icon.png written');
} finally {
  await browser.close();
  server.kill();
}
