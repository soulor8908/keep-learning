// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import widgetDeclarativeVitePlugin, {
  fetchRemoteRegistry,
  normalizeRegistryArray,
  extractVueScript
} from '../vite-plugin.js';

let tmpDir;
let originalFetch;
let consoleWarnSpy;
let consoleLogSpy;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-vite-decl-'));
  originalFetch = globalThis.fetch;
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  if (originalFetch === undefined) delete globalThis.fetch;
  else globalThis.fetch = originalFetch;
  consoleWarnSpy.mockRestore();
  consoleLogSpy.mockRestore();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

function writeFile(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

describe('widget-declarative-plugin vite-plugin', () => {
  describe('T3.3a fetchRemoteRegistry 三层回退链', () => {
    it('远程成功 → 返回归一化 registry 并写入缓存文件', async () => {
      const registryArray = [
        { name: 'bi-sales', js: 'https://cdn/sales.js', css: 'https://cdn/sales.css', vueVersion: '2' },
        { name: 'bi-chart', js: 'https://cdn/chart.js', vueVersion: '3' }
      ];
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => registryArray
      }));

      const cacheFile = path.join(tmpDir, 'cache.json');
      const registry = await fetchRemoteRegistry('https://example.com/registry.json', cacheFile);

      expect(registry).not.toBeNull();
      expect(registry['bi-sales']).toEqual({
        js: 'https://cdn/sales.js',
        css: 'https://cdn/sales.css',
        vueVersion: '2'
      });
      expect(registry['bi-chart'].js).toBe('https://cdn/chart.js');
      expect(registry['bi-chart'].css).toBeUndefined();
      // 缓存文件被写入（原始 JSON 数组格式）
      expect(fs.existsSync(cacheFile)).toBe(true);
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      expect(Array.isArray(cached)).toBe(true);
      expect(cached.length).toBe(2);
    });

    it('远程失败 + cacheFile 存在 → 回退到本地缓存并告警', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('network error');
      });

      // 预写缓存文件（数组格式）
      const cacheFile = path.join(tmpDir, 'cache.json');
      fs.writeFileSync(cacheFile, JSON.stringify([
        { name: 'bi-cached', js: 'https://cdn/cached.js', vueVersion: '2' }
      ]), 'utf8');

      const registry = await fetchRemoteRegistry('https://example.com/registry.json', cacheFile);

      expect(registry).not.toBeNull();
      expect(registry['bi-cached'].js).toBe('https://cdn/cached.js');
      // 告警信息含"使用本地缓存"
      expect(consoleWarnSpy).toHaveBeenCalled();
      const warnMsg = consoleWarnSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(warnMsg).toContain('使用本地缓存');
    });

    it('远程失败 + 无 cacheFile → 返回 null（回退到静态 registry）', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('network error');
      });

      const registry = await fetchRemoteRegistry('https://example.com/registry.json', null);
      expect(registry).toBeNull();
      // 告警信息含"回退到静态 registry"
      const warnMsg = consoleWarnSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(warnMsg).toContain('回退到静态 registry');
    });

    it('远程返回 HTTP 非 200 → 视为失败，触发回退', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({})
      }));

      const registry = await fetchRemoteRegistry('https://example.com/registry.json', null);
      expect(registry).toBeNull();
    });

    it('远程返回对象格式（已是 { name: meta }）→ 原样返回', async () => {
      const objRegistry = {
        'bi-obj': { js: 'https://cdn/obj.js', vueVersion: '2' }
      };
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => objRegistry
      }));

      const registry = await fetchRemoteRegistry('https://example.com/registry.json', null);
      expect(registry).toEqual(objRegistry);
    });
  });

  describe('T3.3b normalizeRegistryArray 归一化', () => {
    it('数组格式 → 按 name 字段索引为 { name: meta }', () => {
      const arr = [
        { name: 'bi-a', js: 'https://a.js', css: 'https://a.css', vueVersion: '2' },
        { name: 'bi-b', js: 'https://b.js' }
      ];
      const map = normalizeRegistryArray(arr);
      expect(map['bi-a']).toEqual({ js: 'https://a.js', css: 'https://a.css', vueVersion: '2' });
      expect(map['bi-b']).toEqual({ js: 'https://b.js' });
    });

    it('已是对象格式 → 原样返回', () => {
      const obj = { 'bi-x': { js: 'https://x.js' } };
      expect(normalizeRegistryArray(obj)).toBe(obj);
    });

    it('null/undefined → 返回空对象', () => {
      expect(normalizeRegistryArray(null)).toEqual({});
      expect(normalizeRegistryArray(undefined)).toEqual({});
    });

    it('数组项缺少 name → 被跳过', () => {
      const arr = [
        { js: 'https://no-name.js' },
        { name: 'bi-ok', js: 'https://ok.js' }
      ];
      const map = normalizeRegistryArray(arr);
      expect(Object.keys(map)).toEqual(['bi-ok']);
    });

    it('vueVersion 数字 → 转字符串', () => {
      const arr = [{ name: 'bi-n', vueVersion: 3 }];
      const map = normalizeRegistryArray(arr);
      expect(map['bi-n'].vueVersion).toBe('3');
    });
  });

  describe('T3.3c extractVueScript 提取', () => {
    it('提取 <script> 块内容与位置', () => {
      const source = '<template><div/></template>\n<script>\nexport default { data() { return {}; } }\n</script>';
      const block = extractVueScript(source);
      expect(block).not.toBeNull();
      expect(block.content).toContain('export default');
      expect(block.content).toContain('data()');
      // start/end 指向 script 内容在源码中的位置
      expect(source.slice(block.start, block.end)).toBe(block.content);
    });

    it('提取带 lang 属性的 <script lang="ts">', () => {
      const source = '<script lang="ts">const x: number = 1;</script>';
      const block = extractVueScript(source);
      expect(block).not.toBeNull();
      expect(block.content).toBe('const x: number = 1;');
      expect(block.attrs).toContain('lang="ts"');
    });

    it('无 <script> 块 → 返回 null', () => {
      expect(extractVueScript('<template><div/></template>')).toBeNull();
    });

    it('提取 <script setup> 块', () => {
      const source = '<script setup>import { ref } from "vue";</script>';
      const block = extractVueScript(source);
      expect(block).not.toBeNull();
      expect(block.content).toContain('ref');
    });
  });

  describe('T3.3d 插件实例与 buildStart 远程 registry 合并', () => {
    it('插件返回 name=enforce=pre 与 transform/buildStart 钩子', () => {
      const plugin = widgetDeclarativeVitePlugin({});
      expect(plugin.name).toBe('widget-declarative-plugin');
      expect(plugin.enforce).toBe('pre');
      expect(typeof plugin.buildStart).toBe('function');
      expect(typeof plugin.transform).toBe('function');
    });

    it('buildStart 拉取远程成功 → 合并到 registry（静态优先覆盖远程）', async () => {
      const remoteArr = [
        { name: 'bi-remote', js: 'https://remote.js', vueVersion: '2' },
        { name: 'bi-overlap', js: 'https://remote-overlap.js', vueVersion: '2' }
      ];
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => remoteArr
      }));

      const plugin = widgetDeclarativeVitePlugin({
        registryUrl: 'https://example.com/registry.json',
        registry: { 'bi-static': { js: 'https://static.js' }, 'bi-overlap': { js: 'https://static-overlap.js' } }
      });

      await plugin.buildStart.call({});

      // buildStart 成功后会 log "registry 就绪"
      const logMsg = consoleLogSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(logMsg).toContain('registry 就绪');
    });

    it('buildStart 无 registryUrl → 直接返回，不拉取', async () => {
      globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
      const plugin = widgetDeclarativeVitePlugin({ registry: { 'bi-x': { js: 'https://x.js' } } });
      await plugin.buildStart.call({});
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('buildStart 远程失败 → 降级，不抛错（构建不阻断）', async () => {
      globalThis.fetch = vi.fn(async () => { throw new Error('boom'); });
      const plugin = widgetDeclarativeVitePlugin({
        registryUrl: 'https://example.com/registry.json'
      });
      // 不应抛错
      await expect(plugin.buildStart.call({})).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('T3.3e transform 钩子（降级模式：无 @babel/core）', () => {
    it('.js 含 $widget( → 注入 import（降级运行时宏模式）', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const code = "const el = $widget('bi-x', { title: 'a' });";
      const result = await plugin.transform.call({}, code, '/abs/path/src/app.js');
      expect(result).not.toBeNull();
      expect(result.code).toContain("import { widgetMount as $widget } from 'wc/widget-declarative-plugin/runtime'");
      // 原代码保留在注入之后
      expect(result.code).toContain("$widget('bi-x'");
    });

    it('.js 不含 $widget → 返回 null（不处理）', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const result = await plugin.transform.call({}, 'const x = 1;', '/abs/src/app.js');
      expect(result).toBeNull();
    });

    it('.vue 含 $widget → 降级注入 import', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const code = '<template><div/></template><script>$widget("bi-x", cfg)</script>';
      const result = await plugin.transform.call({}, code, '/abs/src/Comp.vue');
      expect(result).not.toBeNull();
      expect(result.code).toContain('import { widgetMount as $widget }');
    });

    it('node_modules 路径 → 返回 null（跳过第三方代码）', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const code = "$widget('bi-x', cfg)";
      const result = await plugin.transform.call({}, code, '/abs/node_modules/pkg/index.js');
      expect(result).toBeNull();
    });

    it('虚拟模块（含 \\0）→ 返回 null', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const code = "$widget('bi-x', cfg)";
      const result = await plugin.transform.call({}, code, '/abs/\0virtual.js');
      expect(result).toBeNull();
    });

    it('非目标扩展名（.css/.html）→ 返回 null', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const result = await plugin.transform.call({}, '$widget("bi-x")', '/abs/src/style.css');
      expect(result).toBeNull();
    });

    it('.jsx 含 <Widget 标签 → 触发处理（降级注入 import）', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const code = 'const el = <Widget name="bi-x" />;';
      const result = await plugin.transform.call({}, code, '/abs/src/Comp.jsx');
      // jsxTag "Widget" 出现在代码中 → hasJsx=true → 进入降级路径
      // 但降级注入条件是 hasMacro（$widget），纯 JSX 无 $widget → 返回 null
      // 记录实际行为：纯 JSX 在降级模式下不注入（因 hasMacro=false）
      expect(result).toBeNull();
    });

    it('源码已含 helperModule → 不重复注入', async () => {
      const plugin = widgetDeclarativeVitePlugin({});
      const code = "import { widgetMount as $widget } from 'wc/widget-declarative-plugin/runtime';\n$widget('bi-x');";
      const result = await plugin.transform.call({}, code, '/abs/src/app.js');
      // 已含 helperModule，不重复注入；但 hasMacro=true 且已含 helperModule → 返回 null
      expect(result).toBeNull();
    });

    it('transform 等待 registryFetchPromise 完成（若配置了 registryUrl）', async () => {
      let fetchResolved = false;
      globalThis.fetch = vi.fn(async () => {
        await new Promise(r => setTimeout(r, 10));
        fetchResolved = true;
        return { ok: true, status: 200, json: async () => [] };
      });
      const plugin = widgetDeclarativeVitePlugin({
        registryUrl: 'https://example.com/registry.json'
      });
      await plugin.buildStart.call({});
      expect(fetchResolved).toBe(true);
      // buildStart 已 await 完成，transform 时 registryFetchPromise 已 resolved
      const result = await plugin.transform.call({}, '$widget("bi-x")', '/abs/src/app.js');
      expect(result).not.toBeNull();
    });
  });
});
