// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 物料加载核心链路 E2E（针对 vue3-host，Vite 启动快）
 *
 * ── 前置条件 ──────────────────────────────────────────────────────────
 * 1. 物料产物已预构建并放置到 demo/vue3-host/public/widgets/（bi-*.js）
 *    （构建各 widget-lib 后将 dist 产物拷贝/链接到 public/widgets/）
 * 2. 已启动 vue3-host：
 *      cd demo/vue3-host && npm run build && npx vite preview --port 4173 --strictPort
 *    或开发态：  cd demo/vue3-host && npm run serve   （默认端口 5173，需设置 E2E_BASE_URL）
 * 3. 可通过环境变量覆盖基座地址：E2E_BASE_URL=http://localhost:5173
 *
 * 若基座不可达，所有用例自动 skip（见 beforeEach 可达性检查），不会硬失败。
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173';

test.describe('物料加载链路 (vue3-host)', () => {
  test.beforeEach(async ({ page }) => {
    // 可达性检查：基座未启动时 skip 全部用例，避免 CI 无服务时硬失败
    let reachable = false;
    try {
      const resp = await page.request.get(BASE_URL, { timeout: 8000 });
      reachable = resp.ok();
    } catch (e) {
      reachable = false;
    }
    test.skip(!reachable, `vue3-host 不可达 (${BASE_URL})，请先启动基座并预构建物料产物`);
  });

  test('页面加载后物料 custom element 正确注册', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // 等待第一个物料（bi-filter-bar）作为 Custom Element 挂载到看板第一个插槽
    // 选择器来源：App.vue 中 .dashboard > .widget-slot > .widget-container，物料以 <bi-*> 挂载
    const firstWidget = page.locator('.widget-container bi-filter-bar').first();
    await expect(firstWidget).toBeAttached({ timeout: 20_000 });

    // 断言该 Custom Element 已在 customElements 注册表定义
    const defined = await page.evaluate(() => !!window.customElements.get('bi-filter-bar'));
    expect(defined).toBeTruthy();
  });

  test('物料 props 通过 attribute 正确注入', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // widget-loader 将 widget.props（camelCase）按 kebab-case 写为独立 attribute
    // bi-filter-bar 的 props: { title: 'Vue3 基座 · 筛选栏', filters: [...] }
    // （wrapper 不调用 removeAttribute，attribute 在挂载后仍保留在元素上）
    const filterBar = page.locator('bi-filter-bar').first();
    await expect(filterBar).toBeAttached({ timeout: 20_000 });

    // title 为字符串，原样写入 attribute
    const titleAttr = await filterBar.getAttribute('title');
    expect(titleAttr).toBeTruthy();
    expect(titleAttr).toContain('筛选栏');

    // filters 为数组，序列化为 JSON 字符串写入 attribute
    const filtersAttr = await filterBar.getAttribute('filters');
    expect(filtersAttr).toBeTruthy();
    const parsed = JSON.parse(filtersAttr);
    expect(Array.isArray(parsed)).toBeTruthy();
    expect(parsed.length).toBe(2);
    expect(parsed[0].field).toBe('region');

    // 物料应已渲染出内容（非空）
    await expect(filterBar).not.toBeEmpty({ timeout: 10_000 });
  });

  test('物料加载失败时显示降级占位', async ({ page }) => {
    // 构造加载失败场景：拦截 bi-filter-bar 的脚本请求并强制失败，
    // widget-loader 的 mountWidget 会捕获错误并渲染 .widget-error-placeholder 降级占位
    // （loader 对 SCRIPT_ERROR 有 3 次指数退避重试，约 7s，故等待时间放宽）
    await page.route('**/widgets/bi-filter-bar.js', (route) => route.abort('failed'));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // 第一个 .widget-container 即筛选栏插槽，失败后应在其中渲染降级占位
    const placeholder = page.locator('.widget-container .widget-error-placeholder').first();
    await expect(placeholder).toBeVisible({ timeout: 35_000 });

    // 降级占位带 data-widget-fallback="<物料名>" 标识
    await expect(placeholder).toHaveAttribute('data-widget-fallback', 'bi-filter-bar');
  });

  test('跨物料通信 widget-bus 工作正常', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // 等待日志面板就绪（App.vue 的 .log-panel 监听 widget-bus 事件并写入 .log-list）
    await expect(page.locator('.log-panel')).toBeVisible({ timeout: 15_000 });

    // widget-bus 在 window 上派发 'bi-widget-bus:<type>' CustomEvent，
    // 并暴露 window.widgetBus = { emit, on, once, off }。
    // 这里模拟一个物料 emit 'test-event'，断言 host 侧 on() 监听器收到并写入日志面板
    // （App.vue 监听 test-event 并 addLog('bus', `[test-event] ${JSON.stringify(payload)}`)）
    await page.evaluate(() => {
      window.widgetBus.emit('test-event', { source: 'e2e', widget: 'bi-test' });
    });

    // 日志面板应出现一条包含 test-event 的 bus 日志
    const busLog = page.locator('.log-item', { hasText: 'test-event' }).first();
    await expect(busLog).toBeVisible({ timeout: 10_000 });
    // 该条日志类型标记为 bus
    await expect(busLog.locator('.log-type-bus')).toBeVisible();
  });
});
