import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  // 相对路径，dist 可以部署在任意子路径下
  base: './',
  // 开发服务器默认只放行 web/，catalog.json 在上一级 spec/
  server: {fs: {allow: [fileURLToPath(new URL('..', import.meta.url))]}},
  // three r128 整包约 530 kB，不值得为它拆包
  build: {chunkSizeWarningLimit: 700},
  test: {environment: 'node'},
});
