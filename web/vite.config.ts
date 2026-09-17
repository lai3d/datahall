import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base, so dist can be deployed under any subpath
  base: './',
  // The dev server only allows web/ by default; catalog.json is one level up in spec/
  server: {fs: {allow: [fileURLToPath(new URL('..', import.meta.url))]}},
  // One bundle of about 850 kB: three 0.186 (~600 kB with this project's code) plus React 19 (~220 kB); not worth splitting
  build: {chunkSizeWarningLimit: 900},
  // Unit tests only; browser smoke tests live in e2e/ and run with Playwright
  test: {environment: 'node', include: ['tests/**/*.test.ts']},
});
