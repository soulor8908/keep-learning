import { test, expect } from '@playwright/test';

/**
 * BI 看板基座 E2E 测试（纯 ESM + importmap）
 *
 * 验证 Vue2/Vue3/H5 物料在同一页面共存，依赖隔离由 importmap scopes 处理。
 * 不再有 window.Vue2/Vue3/ElementPlus 全局变量——所有依赖通过浏览器原生 ESM + importmap 解析。
 */

test.describe('BI 看板基座 E2E（纯 ESM）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 物料通过动态 import() + esm.sh CDN 加载，需要较长等待时间
    await page.waitForTimeout(5000);
  });

  // ─── 基础渲染 ───

  test('Vue2/Vue3/H5 物料在同一页面渲染', async ({ page }) => {
    await expect(page.locator('h2:has-text("Vue2 销售面板")')).toBeVisible();
    await expect(page.locator('h2:has-text("Vue3 财务面板")')).toBeVisible();
    await expect(page.locator('h2:has-text("H5 时钟组件")')).toBeVisible();

    // Vue2 物料
    await expect(page.locator('.sales-panel')).toBeVisible();
    // Vue3 物料
    await expect(page.locator('.finance-panel')).toBeVisible();
    // H5 物料
    await expect(page.locator('.clock-widget')).toBeVisible();
  });

  test('页面标题和基座头部渲染正确', async ({ page }) => {
    await expect(page).toHaveTitle(/纯 ESM/);
    await expect(page.locator('h1:has-text("BI 看板")')).toBeVisible();
    await expect(page.locator('button:has-text("切换语言")')).toBeVisible();
  });

  test('importmap 已注入到页面', async ({ page }) => {
    // 验证 importmap script 标签存在且包含 scopes
    const importmapContent = await page.evaluate(() => {
      const script = document.querySelector('script[type="importmap"]');
      return script ? script.textContent : null;
    });
    expect(importmapContent).not.toBeNull();
    const map = JSON.parse(importmapContent);
    // scopes 必须包含 vue2/vue3 的隔离映射
    expect(map.scopes['/widgets/vue2/']).toBeDefined();
    expect(map.scopes['/widgets/vue2/'].vue).toMatch(/vue@2/);
    expect(map.scopes['/widgets/vue3/']).toBeDefined();
    expect(map.scopes['/widgets/vue3/'].vue).toMatch(/vue@3/);
  });

  test('H5 时钟组件实时更新时间', async ({ page }) => {
    const timeEl = page.locator('.clock-time');
    await expect(timeEl).toBeVisible();

    const t1 = await timeEl.textContent();
    await page.waitForTimeout(1500);
    const t2 = await timeEl.textContent();

    expect(t1).not.toBe(t2);
  });

  // ─── 页面稳定性 ───

  test('页面无未捕获异常', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(3000);
    expect(errors).toEqual([]);
  });

  // ─── 交互验证 ───

  test('切换语言按钮可点击', async ({ page }) => {
    const btn = page.locator('.dashboard__header .el-button');
    await expect(btn).toBeVisible();

    await btn.click();
    await expect(btn).toContainText('en-US');

    await btn.click();
    await expect(btn).toContainText('zh-CN');
  });

  test('Vue2 物料按钮点击发出事件', async ({ page }) => {
    const refreshBtn = page.locator('.sales-panel .el-button:has-text("刷新")');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();

    // 事件日志应出现
    await expect(page.locator('.dashboard__event-log')).toBeVisible();
    await expect(page.locator('.dashboard__event-log')).toContainText('sales-panel');
  });

  // ─── 多物料独立性 ───

  test('六个物料区域互不干扰', async ({ page }) => {
    const cards = page.locator('.dashboard__card');
    await expect(cards).toHaveCount(6);

    // Vue2 物料
    await expect(page.locator('.sales-panel')).toContainText('销售');
    await expect(page.locator('.order-panel')).toContainText('订单');

    // Vue3 物料
    await expect(page.locator('.finance-panel')).toContainText('财务');
    await expect(page.locator('.user-panel')).toContainText('用户');

    // H5 物料
    await expect(page.locator('.clock-title')).toBeVisible();
    await expect(page.locator('.chart-title')).toBeVisible();
  });

  // ─── 运行时隔离（ESM 方案：无 window 全局变量） ───

  test('纯 ESM 方案不使用 window 全局变量', async ({ page }) => {
    const globals = await page.evaluate(() => ({
      Vue2: typeof window.Vue2,
      Vue3: typeof window.Vue3,
      ElementPlus: typeof window.ElementPlus,
      ELEMENT: typeof window.ELEMENT
    }));

    // 纯 ESM 方案下，这些全局变量不应该存在（依赖由 importmap 解析，不挂到 window）
    expect(globals.Vue2).toBe('undefined');
    expect(globals.Vue3).toBe('undefined');
    expect(globals.ElementPlus).toBe('undefined');
    expect(globals.ELEMENT).toBe('undefined');
  });

  test('Vue2 和 Vue3 物料使用不同版本的 Vue（通过 importmap scope 隔离）', async ({ page }) => {
    // 物料内部各自 import 'vue'，由 importmap scope 解析到不同版本
    // 验证方式：两个物料都能正常渲染（如果版本冲突会报错）
    await expect(page.locator('.sales-panel')).toBeVisible();
    await expect(page.locator('.finance-panel')).toBeVisible();

    // Vue2 物料的 el-table 和 Vue3 物料的 el-table 应该各自独立工作
    await expect(page.locator('.sales-panel .el-table')).toBeVisible();
    await expect(page.locator('.finance-panel .el-table')).toBeVisible();
  });
});
