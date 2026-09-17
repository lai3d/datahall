import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  // Relative base, so dist can be deployed under any subpath
  base: './',
  // The dev server only allows web/ by default; catalog.json is one level up in spec/
  server: {fs: {allow: [fileURLToPath(new URL('..', import.meta.url))]}},
  // three 0.186 as a whole is about 600 kB (including this project's code); not worth splitting out
  build: {chunkSizeWarningLimit: 700},
  test: {environment: 'node'},
});
