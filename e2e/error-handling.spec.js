import { test, expect } from '@playwright/test';

/**
 * 错误降级 E2E 测试（纯 ESM + importmap）
 *
 * 在真实浏览器中验证 wc/loader.js 的错误处理机制。
 * 纯 ESM 方案下，加载器用动态 import(url) 拿模块命名空间，依赖缺失由 import() 抛错被降级捕获，
 * 不再有 window.Vue2/Vue3 全局变量与 ensureRuntimes。
 *
 * 加载器通过 dev 期挂载的 window.__loader 暴露给测试（见 demo/host/src/main.js，生产构建会 tree-shake）。
 * 合成物料用 data:text/javascript URL 直接 export mount/unmount，验证 ESM 模块解析路径。
 */

// 等待 window.__loader 就绪（main.js 异步动态 import）
async function waitForLoader(page) {
  await page.waitForFunction(() => !!window.__loader, null, { timeout: 10_000 });
}

// 构造 data: URL ESM 模块（Node 侧构造好字符串再传给浏览器，避免跨上下文闭包）
function dataUrl(code) {
  return 'data:text/javascript,' + encodeURIComponent(code);
}

test.describe('错误降级 E2E（纯 ESM）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForLoader(page);
  });

  // ─── 模块加载失败（import() reject） ───

  test('ESM 模块 404 时显示错误占位', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, {
        name: 'biNonexistent',
        url: '/widgets/vue3/this-does-not-exist.js'
      });

      return {
        hasError: !!container.querySelector('.widget-error'),
        hasRetry: !!container.querySelector('.widget-error__retry'),
        text: container.textContent
      };
    });

    expect(result.hasError).toBe(true);
    expect(result.hasRetry).toBe(true);
    expect(result.text).toContain('模块加载失败');
  });

  // ─── mount 未导出 ───

  test('物料未导出 mount 方法时显示错误占位', async ({ page }) => {
    const url = dataUrl('export default { foo: "bar" };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, { name: 'biNoMount', url: u });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    }, url);

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('未导出 mount 方法');
  });

  // ─── mount() 抛异常 ───

  test('mount() 执行异常时显示错误占位', async ({ page }) => {
    const url = dataUrl('export default { mount(){ throw new Error("模拟物料内部崩溃"); } };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, { name: 'biThrow', url: u });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    }, url);

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('模拟物料内部崩溃');
  });

  // ─── CSS 加载失败 ───

  test('CSS 加载失败时显示错误占位', async ({ page }) => {
    const url = dataUrl('export default { mount(c){ c.innerHTML="<div>ok</div>"; return { unmount(){} }; } };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      // 模块本身合法，但 CSS 404 → Promise.all 整体 reject，不挂载
      await mountWidget(container, {
        name: 'biBadCss',
        url: u,
        css: '/widgets/vue3/this-css-does-not-exist.css'
      });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    }, url);

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('CSS 加载失败');
  });

  // ─── 重试按钮：失败后再点击重新挂载 ───

  test('重试按钮重新触发挂载', async ({ page }) => {
    const url = dataUrl('export default { mount(c){ if(window.__retryShouldFail) throw new Error("首次失败"); c.innerHTML="<div class=retry-ok>重试成功</div>"; return { unmount(){} }; } };');

    const containerHandle = await page.evaluateHandle(() => {
      const c = document.createElement('div');
      document.body.appendChild(c);
      return c;
    });

    // 默认 __retryShouldFail 为 undefined（falsy）→ 首次 mount 会成功，需要先置 true
    await page.evaluate(() => { window.__retryShouldFail = true; });

    // 第一次：mount 抛错
    // 注意：page.evaluate 只接受单个参数，多个值需用对象包裹传入。
    await page.evaluate(async ({ container, u }) => {
      const { mountWidget } = window.__loader;
      await mountWidget(container, { name: 'biRetry', url: u });
    }, { container: containerHandle, u: url });

    // 初始状态：失败 + 重试按钮
    await expect(page.locator('.widget-error')).toHaveCount(1);
    await expect(page.locator('.widget-error__retry')).toHaveCount(1);

    // 翻转开关：再次 mount 不再抛错
    await page.evaluate(() => { window.__retryShouldFail = false; });

    // 点击重试 → 重新走 mountWidget → 模块命中缓存 → mount 成功
    await page.locator('.widget-error__retry').click();

    await expect(page.locator('.retry-ok')).toBeVisible();
    await expect(page.locator('.widget-error')).toHaveCount(0);
  });

  // ─── 多物料独立降级 ───

  test('一个物料失败不影响其他物料正常渲染', async ({ page }) => {
    const okUrl = dataUrl('export default { mount(c,p){ c.innerHTML=`<div class=ok-widget>${p.title}</div>`; return { unmount(){} }; } };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget } = window.__loader;

      const okContainer = document.createElement('div');
      const failContainer = document.createElement('div');
      document.body.append(okContainer, failContainer);

      await Promise.all([
        mountWidget(okContainer, {
          name: 'biOk',
          url: u,
          props: { title: '正常物料' }
        }),
        mountWidget(failContainer, {
          name: 'biFail',
          url: '/widgets/vue3/not-found.js'
        })
      ]);

      return {
        okRendered: !!okContainer.querySelector('.ok-widget'),
        okText: okContainer.textContent,
        failHasError: !!failContainer.querySelector('.widget-error'),
        failText: failContainer.textContent
      };
    }, okUrl);

    expect(result.okRendered).toBe(true);
    expect(result.okText).toContain('正常物料');
    expect(result.failHasError).toBe(true);
    expect(result.failText).toContain('模块加载失败');
  });

  // ─── unmount 安全性 ───

  test('unmountWidget 对各种输入不抛异常', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { unmountWidget } = window.__loader;
      const errors = [];
      try { unmountWidget(null); } catch (e) { errors.push('null'); }
      try { unmountWidget(undefined); } catch (e) { errors.push('undefined'); }
      try { unmountWidget({}); } catch (e) { errors.push('{}'); }
      try { unmountWidget({ unmount: () => {} }); } catch (e) { errors.push('valid'); }
      return { errors };
    });

    expect(result.errors).toEqual([]);
  });

  // ─── unmount 正确调用 ───

  test('unmountWidget 正确调用 api.unmount() 并清空容器', async ({ page }) => {
    const url = dataUrl('export default { mount(c){ c.innerHTML="<div>待卸载</div>"; return { unmount(){ c.innerHTML = ""; } }; } };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget, unmountWidget } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      const api = await mountWidget(container, { name: 'biUnmount', url: u });
      unmountWidget(api);

      return { containerEmpty: container.innerHTML === '' };
    }, url);

    expect(result.containerEmpty).toBe(true);
  });

  // ─── 成功加载后返回有效 API ───

  test('成功加载后返回包含 unmount 的 API', async ({ page }) => {
    const url = dataUrl('export default { mount(c,p){ c.innerHTML=`<div>${p.title}</div>`; return { unmount(){} }; } };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      const api = await mountWidget(container, {
        name: 'biApi',
        url: u,
        props: { title: 'API 测试' }
      });

      return {
        hasApi: !!api,
        hasUnmount: typeof api?.unmount === 'function',
        rendered: container.textContent
      };
    }, url);

    expect(result.hasApi).toBe(true);
    expect(result.hasUnmount).toBe(true);
    expect(result.rendered).toContain('API 测试');
  });

  // ─── 缓存机制：同一 URL 不重复 import ───

  test('同一模块 URL 命中缓存不重复加载', async ({ page }) => {
    // 模块体只在首次 import 时执行一次（自增全局计数器）。
    // mountWidget 第二次走 loadModule 应命中 modCache，模块体不再执行 → 计数器仍为 1。
    const url = dataUrl('window.__cacheCount++; export default { mount(c){ c.innerHTML="<div class=cached>cached</div>"; return { unmount(){} }; } };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget } = window.__loader;
      window.__cacheCount = 0;
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, { name: 'biCache', url: u });
      await mountWidget(container, { name: 'biCache', url: u });

      return {
        cacheCount: window.__cacheCount,
        rendered: !!container.querySelector('.cached')
      };
    }, url);

    expect(result.cacheCount).toBe(1);
    expect(result.rendered).toBe(true);
  });
});
