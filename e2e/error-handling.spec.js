import { test, expect } from '@playwright/test';

/**
 * 错误降级 E2E 测试
 *
 * 在真实浏览器中验证 loader.js 的错误处理机制：
 * - 依赖缺失 → 错误占位 + 重试按钮
 * - JS 加载失败 → 错误占位
 * - mount() 抛异常 → 错误占位
 * - 物料未导出 mount → 错误占位
 * - 多物料独立降级（一个失败不影响其他）
 * - unmount 安全性
 */

test.describe('错误降级 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  // ─── 依赖缺失 ───

  test('Vue2 运行时缺失时显示错误占位', async ({ page }) => {
    // 临时删除 window.Vue2
    await page.evaluate(() => { window.Vue2 = undefined; });

    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, {
        name: 'biTestMissingVue2',
        js: '/widgets/sales-panel.js',
        vueVersion: '2',
        props: {}
      });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    });

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('Vue2 运行时未加载');

    // 恢复
    await page.evaluate(async () => {
      await new Promise(r => {
        const s = document.createElement('script');
        s.src = '/runtime/vue2.js';
        s.onload = r;
        document.head.appendChild(s);
      });
      window.Vue2 = window.Vue;
    });
  });

  test('Vue3 运行时缺失时显示错误占位', async ({ page }) => {
    await page.evaluate(() => { window.Vue3 = undefined; });

    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, {
        name: 'biTestMissingVue3',
        js: '/widgets/finance-panel.js',
        vueVersion: '3',
        props: {}
      });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    });

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('Vue3 运行时未加载');

    // 恢复
    await page.evaluate(async () => {
      await new Promise(r => {
        const s = document.createElement('script');
        s.src = '/runtime/vue3.js';
        s.onload = r;
        document.head.appendChild(s);
      });
      window.Vue3 = window.Vue;
    });
  });

  // ─── JS 加载失败 ───

  test('JS 加载失败时显示错误占位', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, {
        name: 'biNonexistent',
        js: '/widgets/this-does-not-exist.js',
        vueVersion: '3'
      });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    });

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('加载失败');
  });

  // ─── mount 未导出 ───

  test('物料未导出 mount 时显示错误占位', async ({ page }) => {
    // 注册一个没有 mount 方法的假物料
    await page.evaluate(() => {
      window.biBadWidget = { foo: 'bar' };
    });

    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, {
        name: 'biBadWidget',
        js: 'data:text/javascript,window.biBadWidget={foo:"bar"}',
        vueVersion: '3'
      });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    });

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('未导出 mount 方法');
  });

  // ─── mount() 抛异常 ───

  test('mount() 执行异常时显示错误占位', async ({ page }) => {
    await page.evaluate(() => {
      window.biThrowWidget = {
        mount() {
          throw new Error('模拟物料内部崩溃');
        }
      };
    });

    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, {
        name: 'biThrowWidget',
        js: 'data:text/javascript,',
        vueVersion: '3'
      });

      return {
        hasError: !!container.querySelector('.widget-error'),
        text: container.textContent
      };
    });

    expect(result.hasError).toBe(true);
    expect(result.text).toContain('模拟物料内部崩溃');
  });

  // ─── 重试按钮 ───

  test('错误占位包含重试按钮且可点击', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      // 第一次加载失败
      await mountWidget(container, {
        name: 'biRetryWidget',
        js: '/widgets/not-found.js',
        vueVersion: '3',
        retryable: true
      });

      const hasRetryBtn = !!container.querySelector('.widget-error__retry');

      // 修复：注册一个可以成功挂载的物料
      window.biRetryWidget = {
        mount(c, props) {
          c.innerHTML = '<div class="retry-success">重试成功</div>';
          return { unmount: () => { c.innerHTML = ''; } };
        }
      };

      // 模拟重试：清除错误，重新挂载
      container.innerHTML = '';
      await mountWidget(container, {
        name: 'biRetryWidget',
        js: 'data:text/javascript,',
        vueVersion: '3'
      });

      return {
        hasRetryBtn,
        successText: container.textContent
      };
    });

    expect(result.hasRetryBtn).toBe(true);
    expect(result.successText).toContain('重试成功');
  });

  // ─── 重试按钮始终可用 ───

  test('加载失败时显示重试按钮', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      await mountWidget(container, {
        name: 'biNoRetryWidget',
        js: '/widgets/not-found.js',
        vueVersion: '3'
      });

      return {
        hasRetryBtn: !!container.querySelector('.widget-error__retry'),
        hasError: !!container.querySelector('.widget-error')
      };
    });

    expect(result.hasError).toBe(true);
    expect(result.hasRetryBtn).toBe(true);
  });

  // ─── 多物料独立降级 ───

  test('一个物料失败不影响其他物料正常渲染', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');

      // 成功物料
      const okContainer = document.createElement('div');
      document.body.appendChild(okContainer);
      window.biOkWidget = {
        mount(c, props) {
          c.innerHTML = `<div class="ok-widget">${props.title}</div>`;
          return { unmount: () => { c.innerHTML = ''; } };
        }
      };

      // 失败物料
      const failContainer = document.createElement('div');
      document.body.appendChild(failContainer);

      // 并发加载
      await Promise.all([
        mountWidget(okContainer, {
          name: 'biOkWidget',
          js: 'data:text/javascript,',
          vueVersion: '3',
          props: { title: '正常物料' }
        }),
        mountWidget(failContainer, {
          name: 'biFailWidget',
          js: '/widgets/not-found.js',
          vueVersion: '3'
        })
      ]);

      return {
        okRendered: !!okContainer.querySelector('.ok-widget'),
        okText: okContainer.textContent,
        failHasError: !!failContainer.querySelector('.widget-error'),
        failText: failContainer.textContent
      };
    });

    expect(result.okRendered).toBe(true);
    expect(result.okText).toContain('正常物料');
    expect(result.failHasError).toBe(true);
    expect(result.failText).toContain('加载失败');
  });

  // ─── unmount 安全性 ───

  test('unmountWidget 对各种输入不抛异常', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { unmountWidget } = await import('/loader.js');
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

  test('unmountWidget 正确调用 api.unmount()', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget, unmountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      let unmountCalled = false;
      window.biUnmountTestWidget = {
        mount(c) {
          c.innerHTML = '<div>待卸载</div>';
          return {
            unmount: () => { unmountCalled = true; c.innerHTML = ''; }
          };
        }
      };

      const api = await mountWidget(container, {
        name: 'biUnmountTestWidget',
        js: 'data:text/javascript,',
        vueVersion: '3'
      });

      unmountWidget(api);

      return {
        unmountCalled,
        containerEmpty: container.innerHTML === ''
      };
    });

    expect(result.unmountCalled).toBe(true);
    expect(result.containerEmpty).toBe(true);
  });

  // ─── 物料加载成功后返回有效 API ───

  test('成功加载后返回包含 unmount 的 API', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      window.biApiTestWidget = {
        mount(c, props) {
          c.innerHTML = `<div>${props.title}</div>`;
          return { unmount: () => { c.innerHTML = ''; } };
        }
      };

      const api = await mountWidget(container, {
        name: 'biApiTestWidget',
        js: 'data:text/javascript,',
        vueVersion: '3',
        props: { title: 'API 测试' }
      });

      return {
        hasApi: !!api,
        hasUnmount: typeof api?.unmount === 'function',
        rendered: container.textContent
      };
    });

    expect(result.hasApi).toBe(true);
    expect(result.hasUnmount).toBe(true);
    expect(result.rendered).toContain('API 测试');
  });

  // ─── 缓存机制 ───

  test('同一 URL 不重复加载脚本', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { mountWidget } = await import('/loader.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      let loadCount = 0;
      const origAppendChild = document.head.appendChild.bind(document.head);

      // 监听 script 添加
      document.head.appendChild = function(child) {
        if (child.tagName === 'SCRIPT' && child.src && child.src.includes('cache-test')) {
          loadCount++;
        }
        return origAppendChild(child);
      };

      window.biCacheTestWidget = {
        mount(c) { c.innerHTML = 'ok'; return { unmount: () => {} }; }
      };

      await mountWidget(container, {
        name: 'biCacheTestWidget',
        js: 'data:text/javascript,//cache-test-1',
        vueVersion: '3'
      });
      await mountWidget(container, {
        name: 'biCacheTestWidget',
        js: 'data:text/javascript,//cache-test-1',
        vueVersion: '3'
      });

      document.head.appendChild = origAppendChild;
      return { loadCount };
    });

    // 第一次调用加载脚本（loadCount=1），第二次命中缓存不再加载（loadCount 不变）
    expect(result.loadCount).toBe(1);
  });
});
