import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// cheoma 코어는 bare 'three' 를 import 한다. 한 인스턴스만 쓰도록 alias + dedupe (cheoma/app/vite.config.js 와 동일 계약).
const threeMain = fileURLToPath(new URL('./node_modules/three/build/three.module.js', import.meta.url));
const threeAddons = fileURLToPath(new URL('./node_modules/three/examples/jsm/', import.meta.url));
const cheomaSrc = fileURLToPath(new URL('../cheoma/src/', import.meta.url));
const parentRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      { find: /^three\/addons\//, replacement: threeAddons },
      { find: /^three$/, replacement: threeMain },
      // package exports 맵이 깊은 경로를 막으므로 cheoma/src/* 는 체크아웃 소스로 직접 alias
      { find: /^cheoma\/src\//, replacement: cheomaSrc },
    ],
    dedupe: ['three'],
  },
  server: { fs: { allow: [parentRoot] } },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
