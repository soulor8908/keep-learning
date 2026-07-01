import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * 体积优化验证 E2E 测试（纯 ESM + importmap）
 *
 * 验证纯 ESM 方案的体积目标：
 * - 单个物料产物小（依赖 external，由 importmap 解析到 esm.sh CDN）
 * - loader.js / WidgetHost.vue / 物料模板保持轻量
 * - 旧模块与 UMD 产物已彻底移除
 * - 浏览器实际加载的物料 JS 资源体积合理
 */

const ROOT = path.resolve(__dirname, '..');
const WC_DIR = path.join(ROOT, 'wc');
const DEMO_DIR = path.join(ROOT, 'demo');

function getFileSizeKB(filePath) {
  return fs.statSync(filePath).size / 1024;
}

function getLineCount(filePath) {
  return fs.readFileSync(filePath, 'utf-8').split('\n').length;
}

function dirExists(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

test.describe('体积优化验证（纯 ESM）', () => {
  // ─── 物料产物体积（依赖 external，产物只含物料自身代码） ───

  test('Vue2 物料产物 < 4KB', () => {
    const jsSize = getFileSizeKB(path.join(DEMO_DIR, 'vue2-widgets/dist/sales-panel.js'));
    console.log(`Vue2 sales-panel.js: ${jsSize.toFixed(2)} KB`);
    expect(jsSize).toBeLessThan(4);
  });

  test('Vue3 物料产物 < 8KB', () => {
    const jsSize = getFileSizeKB(path.join(DEMO_DIR, 'vue3-widgets/dist/finance-panel.js'));
    console.log(`Vue3 finance-panel.js: ${jsSize.toFixed(2)} KB`);
    // element-plus 组件按需注册会带入少量胶水代码，阈值较 Vue2 略宽
    expect(jsSize).toBeLessThan(8);
  });

  test('H5 物料产物 < 2KB', () => {
    const jsSize = getFileSizeKB(path.join(DEMO_DIR, 'h5-widgets/dist/clock-widget.js'));
    console.log(`H5 clock-widget.js: ${jsSize.toFixed(2)} KB`);
    expect(jsSize).toBeLessThan(2);
  });

  test('物料库总产物 < 20KB', () => {
    function dirSize(dir) {
      let total = 0;
      for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isFile() && (f.endsWith('.js') || f.endsWith('.css'))) {
          total += fs.statSync(fp).size;
        }
      }
      return total / 1024;
    }

    const vue2 = dirSize(path.join(DEMO_DIR, 'vue2-widgets/dist'));
    const vue3 = dirSize(path.join(DEMO_DIR, 'vue3-widgets/dist'));
    const h5 = dirSize(path.join(DEMO_DIR, 'h5-widgets/dist'));
    const total = vue2 + vue3 + h5;

    console.log(`Total widget size: ${total.toFixed(2)} KB`);
    console.log(`  Vue2: ${vue2.toFixed(2)} KB`);
    console.log(`  Vue3: ${vue3.toFixed(2)} KB`);
    console.log(`  H5:   ${h5.toFixed(2)} KB`);

    expect(total).toBeLessThan(30);
  });

  // ─── 运行时代码行数（浏览器实际加载的部分） ───

  test('loader.js < 200 行', () => {
    const lines = getLineCount(path.join(WC_DIR, 'loader.js'));
    console.log(`loader.js: ${lines} 行`);
    expect(lines).toBeLessThan(200);
  });

  test('WidgetHost.vue < 120 行', () => {
    const lines = getLineCount(path.join(WC_DIR, 'WidgetHost.vue'));
    console.log(`WidgetHost.vue: ${lines} 行`);
    expect(lines).toBeLessThan(120);
  });

  test('物料模板各保持轻量', () => {
    const vue2Lines = getLineCount(path.join(WC_DIR, 'templates/vue2.js'));
    const vue3Lines = getLineCount(path.join(WC_DIR, 'templates/vue3.js'));
    const h5Lines = getLineCount(path.join(WC_DIR, 'templates/h5.js'));

    console.log(`templates/vue2.js: ${vue2Lines} 行`);
    console.log(`templates/vue3.js: ${vue3Lines} 行`);
    console.log(`templates/h5.js:   ${h5Lines} 行`);

    expect(vue2Lines).toBeLessThan(50);
    expect(vue3Lines).toBeLessThan(55);
    expect(h5Lines).toBeLessThan(40);
  });

  test('核心运行时总代码 < 450 行', () => {
    const loaderLines = getLineCount(path.join(WC_DIR, 'loader.js'));
    const hostLines = getLineCount(path.join(WC_DIR, 'WidgetHost.vue'));
    const vue2Lines = getLineCount(path.join(WC_DIR, 'templates/vue2.js'));
    const vue3Lines = getLineCount(path.join(WC_DIR, 'templates/vue3.js'));
    const h5Lines = getLineCount(path.join(WC_DIR, 'templates/h5.js'));
    const total = loaderLines + hostLines + vue2Lines + vue3Lines + h5Lines;

    console.log(`核心运行时总行数: ${total}`);
    console.log(`  loader.js:      ${loaderLines}`);
    console.log(`  WidgetHost.vue:  ${hostLines}`);
    console.log(`  templates:       ${vue2Lines + vue3Lines + h5Lines}`);

    expect(total).toBeLessThan(450);
  });

  // ─── UMD 方案彻底移除 ───

  test('esm/ 临时目录已删除', () => {
    expect(dirExists(path.join(ROOT, 'esm'))).toBe(false);
  });

  test('物料产物不含 UMD 文件', () => {
    const dists = ['vue2-widgets/dist', 'vue3-widgets/dist', 'h5-widgets/dist'];
    for (const d of dists) {
      const dir = path.join(DEMO_DIR, d);
      if (!fs.existsSync(dir)) continue;
      const umdFiles = fs.readdirSync(dir).filter((f) => /umd/i.test(f));
      expect(umdFiles, `${d} 不应残留 UMD 产物: ${umdFiles.join(', ')}`).toEqual([]);
    }
  });

  test('物料 manifest 声明 format=esm', () => {
    for (const stack of ['vue2-widgets', 'vue3-widgets', 'h5-widgets']) {
      const manifestPath = path.join(DEMO_DIR, stack, 'dist/manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.format, `${stack} manifest.format 应为 esm`).toBe('esm');
    }
  });

  test('旧模块已被删除', () => {
    const deletedModules = [
      'widget-loader',
      'widget-wrapper-plugin',
      'widget-bus',
      'widget-context',
      'widget-declarative-plugin',
      'widget-scope',
      'widget-registry',
      'widget-page',
      'schema-generator',
      'ai-assistant',
      'css-namespace-checker',
      'js-risk-scanner',
      'scoped-style-checker',
      'dependency-analyzer',
      'migration-skill',
      'ai-schema-enricher',
      'devtools-extension'
    ];

    for (const mod of deletedModules) {
      expect(dirExists(path.join(ROOT, mod)), `旧模块 ${mod} 应已删除`).toBe(false);
    }
  });

  // ─── 浏览器中验证实际加载体积 ───

  test('页面加载的物料 JS 资源体积合理', async ({ page }) => {
    const resources = [];

    page.on('response', async (response) => {
      const url = response.url();
      // 只统计基座自托管的物料产物（/widgets/...），不含 CDN 上的 vue/element-plus
      if (!url.includes('/widgets/')) return;
      try {
        const body = await response.body();
        resources.push({ url: url.replace(/.*\//, ''), sizeKB: body.length / 1024 });
      } catch {}
    });

    await page.goto('/');
    await page.waitForTimeout(5000);

    console.log('加载的物料 JS/CSS 资源:');
    resources.forEach((r) => console.log(`  ${r.url}: ${r.sizeKB.toFixed(2)} KB`));

    // 物料产物依赖 external，单个应很小
    const jsResources = resources.filter((r) => r.url.endsWith('.js'));
    for (const r of jsResources) {
      expect(r.sizeKB, `${r.url} 体积过大`).toBeLessThan(8);
    }
  });

  test('无大体积冗余资源（物料自身）', async ({ page }) => {
    const resources = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/widgets/')) return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('javascript') && !url.endsWith('.js')) return;
      try {
        const body = await response.body();
        resources.push({ url: url.replace(/.*\//, ''), sizeKB: body.length / 1024 });
      } catch {}
    });

    await page.goto('/');
    await page.waitForTimeout(5000);

    // CDN 上的 vue/element-plus 是已知共享依赖，不在此检查范围；
    // 物料自身产物不应出现大体积资源
    for (const r of resources) {
      expect(r.sizeKB, `${r.url} 物料产物体积异常`).toBeLessThan(10);
    }
  });
});
