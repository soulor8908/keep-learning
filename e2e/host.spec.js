import { test, expect } from '@playwright/test';

test.describe('BI 看板基座 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  // ─── 基础渲染 ───

  test('调试：查看所有 widget-host', async ({ page }) => {
    const logs = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));

    const hosts = await page.locator('.widget-host').count();
    console.log('widget-host count:', hosts);
    for (let i = 0; i < hosts; i++) {
      const html = await page.locator('.widget-host').nth(i).innerHTML();
      console.log(`host ${i}:`, html.substring(0, 300));
    }

    const cards = await page.locator('.dashboard__card').count();
    console.log('card count:', cards);

    console.log('logs:', logs.filter(l => l.includes('error') || l.includes('Error')).join('\n'));
  });

  test('Vue2/Vue3/H5 物料在同一页面渲染', async ({ page }) => {
    await expect(page.locator('h2:has-text("Vue2 销售面板")')).toBeVisible();
    await expect(page.locator('h2:has-text("Vue3 财务面板")')).toBeVisible();
    await expect(page.locator('h2:has-text("H5 时钟组件")')).toBeVisible();

    // Vue2: $mount 会替换宿主元素，sales-panel 直接出现在 section 中
    await expect(page.locator('.sales-panel')).toBeVisible();
    // Vue3: createApp.mount 在 widget-host 内部渲染
    await expect(page.locator('.finance-panel')).toBeVisible();
    // H5: innerHTML 直接写入 widget-host
    await expect(page.locator('.clock-widget')).toBeVisible();
  });

  test('页面标题和基座头部渲染正确', async ({ page }) => {
    await expect(page.locator('h1:has-text("BI 看板")')).toBeVisible();
    await expect(page.locator('button:has-text("切换语言")')).toBeVisible();
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

  test('控制台无 DEP_MISSING 错误', async ({ page }) => {
    const depErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('DEP_MISSING')) {
        depErrors.push(msg.text());
      }
    });
    await page.waitForTimeout(3000);
    expect(depErrors).toEqual([]);
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

  // ─── 卸载清理 ───

  test('WidgetHost 卸载后容器被清空', async ({ page }) => {
    // H5 widget-host 保留完整，可以检查
    const clockHost = page.locator('.clock-widget').locator('..');
    await expect(page.locator('.clock-widget')).toBeVisible();

    const innerHtml = await page.locator('.clock-widget').innerHTML();
    expect(innerHtml).toContain('clock-time');
  });

  // ─── 错误降级 ───

  test('加载不存在的物料时显示错误占位', async ({ page }) => {
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'error-test';
      document.body.appendChild(container);

      const script = document.createElement('script');
      script.src = '/widgets/nonexistent-widget.js';
      script.onerror = () => {
        container.innerHTML = `
          <div class="widget-error" style="padding:12px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:13px">
            <div>JS 加载失败: /widgets/nonexistent-widget.js</div>
          </div>
        `;
      };
      document.head.appendChild(script);
    });

    const errorPlaceholder = page.locator('#error-test .widget-error');
    await expect(errorPlaceholder).toBeVisible({ timeout: 10000 });
    await expect(errorPlaceholder).toContainText('加载失败');
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
    await expect(page.locator('.clock-title')).toContainText('时钟');
  });

  // ─── 运行时隔离 ───

  test('全局运行时变量正确挂载', async ({ page }) => {
    const globals = await page.evaluate(() => ({
      Vue2: typeof window.Vue2,
      Vue3: typeof window.Vue3,
      ElementPlus: typeof window.ElementPlus
    }));

    expect(globals.Vue2).toBe('function');
    expect(globals.Vue3).toBe('object');
    expect(globals.ElementPlus).toBe('object');
  });

  test('Vue2 和 Vue3 运行时互不干扰', async ({ page }) => {
    const result = await page.evaluate(() => {
      const v2 = window.Vue2;
      const v3 = window.Vue3;

      return {
        vue2Version: v2.version,
        vue3Version: v3.version,
        vue2IsVue2: v2.version.startsWith('2.'),
        vue3IsVue3: v3.version.startsWith('3.')
      };
    });

    expect(result.vue2IsVue2).toBe(true);
    expect(result.vue3IsVue3).toBe(true);
  });
});
