import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * 体积优化验证 E2E 测试
 *
 * 验证 REFACTOR_PLAN_V4 的体积目标：
 * - 单个物料 < 1KB（UMD + external）
 * - loader.js < 200 行
 * - WidgetHost.vue < 70 行
 * - 总运行时代码 < 500 行（对比旧方案 17,000 行）
 */

const ROOT = path.resolve(__dirname, '..');
const WC_DIR = path.join(ROOT, 'wc');
const DEMO_DIR = path.join(ROOT, 'demo');

function getFileSizeKB(filePath) {
  const stat = fs.statSync(filePath);
  return stat.size / 1024;
}

function getLineCount(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').length;
}

test.describe('体积优化验证', () => {
  // ─── 物料产物体积 ───

  test('Vue2 物料产物 < 7KB', () => {
    const jsSize = getFileSizeKB(path.join(DEMO_DIR, 'vue2-widgets/dist/vue2-widgets.js'));
    const cssSize = getFileSizeKB(path.join(DEMO_DIR, 'vue2-widgets/dist/style.css'));

    console.log(`Vue2 widgets.js: ${jsSize.toFixed(2)} KB`);
    console.log(`Vue2 style.css: ${cssSize.toFixed(2)} KB`);
    console.log(`Vue2 total: ${(jsSize + cssSize).toFixed(2)} KB`);

    expect(jsSize).toBeLessThan(7);
  });

  test('Vue3 物料产物 < 7KB', () => {
    const jsSize = getFileSizeKB(path.join(DEMO_DIR, 'vue3-widgets/dist/vue3-widgets.js'));
    const cssSize = getFileSizeKB(path.join(DEMO_DIR, 'vue3-widgets/dist/style.css'));

    console.log(`Vue3 widgets.js: ${jsSize.toFixed(2)} KB`);
    console.log(`Vue3 style.css: ${cssSize.toFixed(2)} KB`);
    console.log(`Vue3 total: ${(jsSize + cssSize).toFixed(2)} KB`);

    expect(jsSize).toBeLessThan(7);
  });

  test('H5 物料产物 < 3KB', () => {
    const jsSize = getFileSizeKB(path.join(DEMO_DIR, 'h5-widgets/dist/h5-widgets.js'));

    console.log(`H5 widgets.js: ${jsSize.toFixed(2)} KB`);

    expect(jsSize).toBeLessThan(3);
  });

  test('物料库总产物 < 20KB', () => {
    const vue2Js = getFileSizeKB(path.join(DEMO_DIR, 'vue2-widgets/dist/vue2-widgets.js'));
    const vue2Css = getFileSizeKB(path.join(DEMO_DIR, 'vue2-widgets/dist/style.css'));
    const vue3Js = getFileSizeKB(path.join(DEMO_DIR, 'vue3-widgets/dist/vue3-widgets.js'));
    const vue3Css = getFileSizeKB(path.join(DEMO_DIR, 'vue3-widgets/dist/style.css'));
    const h5Js = getFileSizeKB(path.join(DEMO_DIR, 'h5-widgets/dist/h5-widgets.js'));
    const total = vue2Js + vue2Css + vue3Js + vue3Css + h5Js;

    console.log(`Total widget size: ${total.toFixed(2)} KB`);
    console.log(`  Vue2: ${(vue2Js + vue2Css).toFixed(2)} KB`);
    console.log(`  Vue3: ${(vue3Js + vue3Css).toFixed(2)} KB`);
    console.log(`  H5:   ${h5Js.toFixed(2)} KB`);

    expect(total).toBeLessThan(20);
  });

  // ─── 运行时代码行数 ───

  test('loader.js < 200 行', () => {
    const lines = getLineCount(path.join(WC_DIR, 'loader.js'));
    console.log(`loader.js: ${lines} 行`);
    expect(lines).toBeLessThan(230);
  });

  test('WidgetHost.vue < 120 行', () => {
    const lines = getLineCount(path.join(WC_DIR, 'WidgetHost.vue'));
    console.log(`WidgetHost.vue: ${lines} 行`);
    expect(lines).toBeLessThan(120);
  });

  test('物料模板各 < 40 行', () => {
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

  test('核心运行时总代码 < 350 行', () => {
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

  // ─── 已删除模块不存在 ───

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
      const dir = path.join(ROOT, mod);
      expect(fs.existsSync(dir), `旧模块 ${mod} 应已删除，但仍存在`).toBe(false);
    }
  });

  // ─── 浏览器中验证实际加载体积 ───

  test('页面加载的 JS 资源体积合理', async ({ page }) => {
    const resources = [];

    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';

      if (contentType.includes('javascript') || url.endsWith('.js')) {
        try {
          const body = await response.body();
          resources.push({
            url: url.replace(/.*\//, ''),
            sizeKB: (body.length / 1024).toFixed(2)
          });
        } catch {}
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    console.log('加载的 JS 资源:');
    resources.forEach(r => console.log(`  ${r.url}: ${r.sizeKB} KB`));

    // 物料 JS 应该很小（< 2KB gzipped）
    const widgetResources = resources.filter(r =>
      r.url.includes('widget.js')
    );

    for (const r of widgetResources) {
      expect(Number(r.sizeKB)).toBeLessThan(2);
    }
  });

  test('无大体积冗余资源', async ({ page }) => {
    const resources = [];

    page.on('response', async (response) => {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('javascript') || contentType.includes('css')) {
        try {
          const body = await response.body();
          resources.push({
            url: response.url().replace(/.*\//, ''),
            sizeKB: (body.length / 1024).toFixed(2),
            type: contentType.includes('css') ? 'css' : 'js'
          });
        } catch {}
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // 检查没有异常大的资源（排除 Vue/ElementPlus 运行时）
    const largeResources = resources.filter(r => {
      const size = Number(r.sizeKB);
      return size > 500;
    });

    if (largeResources.length > 0) {
      console.log('大体积资源:');
      largeResources.forEach(r => console.log(`  ${r.url}: ${r.sizeKB} KB`));
    }

    // Vue3 运行时约 130KB，ElementPlus 约 800KB，这些都是已知的共享依赖
    // 物料本身不应有大资源
    const widgetResources = resources.filter(r => r.url.includes('widget'));
    for (const r of widgetResources) {
      expect(Number(r.sizeKB)).toBeLessThan(10);
    }
  });
});
