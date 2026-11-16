import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base, so dist can be deployed under any subpath
  base: './',
  // The dev server only allows web/ by default; catalog.json is one level up in spec/
  server: {fs: {allow: [fileURLToPath(new URL('..', import.meta.url))]}},
  // The largest chunks are the panel's entry (about 440 kB with React 19) and the 3D scene with three 0.186 (about 370 kB), loaded after it
  build: {chunkSizeWarningLimit: 900},
  // Unit tests only; browser smoke tests live in e2e/ and run with Playwright
  test: {environment: 'node', include: ['tests/**/*.test.ts']},
});
