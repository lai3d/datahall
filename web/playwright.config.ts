// Browser smoke tests for the web app. They drive the real page (panel and 3D view) through its
// DOM ids, data-* attributes and the window.__datahall test hook, so they survive refactors of the
// panel implementation. The page under test is a production build made with --mode e2e (test hook
// on, analytics off), served by vite preview.
import {defineConfig, devices} from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // CI runners have no GPU; recent Chromium only falls back to software WebGL with this flag
    launchOptions: {args: ['--enable-unsafe-swiftshader']},
  },
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}, grepInvert: /@mobile/},
    {name: 'mobile', use: {...devices['Pixel 7']}, grep: /@mobile/},
  ],
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
