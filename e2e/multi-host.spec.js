// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Vue2 / Vue3 双运行时共存 E2E
 *
 * ── 前置条件 ──────────────────────────────────────────────────────────
 * 需同时启动两个基座，且各自 public/widgets/ 已预构建物料产物：
 *   - vue2-host:  cd demo/vue2-host && npm run serve   （默认端口 8080）
 *   - vue3-host:  cd demo/vue3-host && npm run build && npx vite preview --port 4173 --strictPort
 *
 * 可用环境变量覆盖地址：
 *   E2E_VUE2_BASE_URL=http://localhost:8080
 *   E2E_VUE3_BASE_URL=http://localhost:4173
 *
 * 若对应基座不可达，该用例自动 skip。
 */

const VUE2_BASE_URL = process.env.E2E_VUE2_BASE_URL || 'http://localhost:8080';
const VUE3_BASE_URL = process.env.E2E_VUE3_BASE_URL || 'http://localhost:4173';

/**
 * 探测基座是否可达，不可达则 skip 当前用例
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} label
 */
async function skipIfUnreachable(page, url, label) {
  let reachable = false;
  try {
    const resp = await page.request.get(url, { timeout: 8000 });
    reachable = resp.ok();
  } catch (e) {
    reachable = false;
  }
  test.skip(!reachable, `${label} 不可达 (${url})，请先启动该基座并预构建物料产物`);
}

test.describe('Vue2 / Vue3 双运行时共存', () => {
  test('vue2-host 加载 Vue2 物料', async ({ page }) => {
    await skipIfUnreachable(page, VUE2_BASE_URL, 'vue2-host');
    await page.goto(VUE2_BASE_URL, { waitUntil: 'domcontentloaded' });

    // vue2-host main.js 暴露 window.Vue2
    const hasVue2 = await page.evaluate(() => typeof window.Vue2 !== 'undefined');
    expect(hasVue2).toBeTruthy();

    // 物料以 Custom Element 挂载；vue2-host 看板第一个插槽同样是筛选栏（bi-filter-bar）
    const widget = page.locator('.widget-container bi-filter-bar').first();
    await expect(widget).toBeAttached({ timeout: 20_000 });
    await expect(widget).not.toBeEmpty({ timeout: 10_000 });
  });

  test('vue3-host 加载 Vue3 物料', async ({ page }) => {
    await skipIfUnreachable(page, VUE3_BASE_URL, 'vue3-host');
    await page.goto(VUE3_BASE_URL, { waitUntil: 'domcontentloaded' });

    // vue3-host main.js 暴露 window.Vue3
    const hasVue3 = await page.evaluate(() => typeof window.Vue3 !== 'undefined');
    expect(hasVue3).toBeTruthy();

    // 数据源面板插槽挂载 bi-data-source（vueVersion: '3'）
    const widget = page.locator('bi-data-source').first();
    await expect(widget).toBeAttached({ timeout: 20_000 });
    await expect(widget).not.toBeEmpty({ timeout: 10_000 });
  });
});
