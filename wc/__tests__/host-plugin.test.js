import { describe, it, expect } from 'vitest';
import { importmapInjectPlugin } from '../host-plugin.js';

// 纯 Node 逻辑测试：transformIndexHtml 是字符串替换，无需 DOM。
const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="x.css" />
    <!--IMPORTMAP_INJECT-->
    <!-- importmap 占位 -->
    <!--/IMPORTMAP_INJECT-->
  </head>
  <body><div id="app"></div></body>
</html>`;

describe('host-plugin', () => {
  describe('importmapInjectPlugin', () => {
    it('把占位标记替换为 <script type="importmap">，含 imports 与 scopes', () => {
      const plugin = importmapInjectPlugin();
      const out = plugin.transformIndexHtml(PLACEHOLDER_HTML);
      expect(out).toContain('<script type="importmap">');
      expect(out).not.toContain('<!--IMPORTMAP_INJECT-->');
      // 默认 hostStack=vue3，顶层 vue 解析到 Vue3
      expect(out).toContain('vue@3.4.21');
      // scope 仍含 vue2/vue3 分流
      expect(out).toContain('/widgets/vue2/');
      expect(out).toContain('/widgets/vue3/');
    });

    it('hostStack=vue2 时顶层 vue 为 Vue2', () => {
      const plugin = importmapInjectPlugin({ hostStack: 'vue2' });
      const out = plugin.transformIndexHtml(PLACEHOLDER_HTML);
      // 顶层 imports.vue = Vue2，但 scope 仍各自分流
      expect(out).toMatch(/"vue":"https:\/\/esm\.sh\/vue@2\.6\.14"/);
    });

    it('hostStack=none 时顶层不含 vue（h5 基座）', () => {
      const plugin = importmapInjectPlugin({ hostStack: 'none' });
      const out = plugin.transformIndexHtml(PLACEHOLDER_HTML);
      // 没有顶层 "vue":... 键，但 scope 里有
      const map = JSON.parse(out.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
      expect(map.imports.vue).toBeUndefined();
      expect(map.scopes['/widgets/vue2/'].vue).toBeDefined();
    });

    it('compat=true 在 importmap 前注入 es-module-shims 嗅探脚本', () => {
      const plugin = importmapInjectPlugin({ compat: true });
      const out = plugin.transformIndexHtml(PLACEHOLDER_HTML);
      const sniffIdx = out.indexOf('HTMLScriptElement.supports');
      const mapIdx = out.indexOf('<script type="importmap">');
      expect(sniffIdx).toBeGreaterThan(-1);
      expect(mapIdx).toBeGreaterThan(-1);
      expect(sniffIdx).toBeLessThan(mapIdx);
      // 嗅探脚本引用默认 shim URL
      expect(out).toContain('es-module-shims');
    });

    it('compat=false（默认）不注入嗅探脚本', () => {
      const plugin = importmapInjectPlugin();
      const out = plugin.transformIndexHtml(PLACEHOLDER_HTML);
      expect(out).not.toContain('HTMLScriptElement.supports');
    });

    it('shimUrl 自定义覆盖默认 CDN', () => {
      const plugin = importmapInjectPlugin({ compat: true, shimUrl: 'http://intranet/shim.js' });
      const out = plugin.transformIndexHtml(PLACEHOLDER_HTML);
      expect(out).toContain('http://intranet/shim.js');
    });

    it('cdnBase 覆盖传导到 importmap URL', () => {
      const plugin = importmapInjectPlugin({ cdnBase: 'http://internal-cdn' });
      const out = plugin.transformIndexHtml(PLACEHOLDER_HTML);
      expect(out).toContain('http://internal-cdn/vue@3.4.21');
    });
  });
});
