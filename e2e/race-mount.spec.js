import { test, expect } from '@playwright/test';

/**
 * 挂载竞态 E2E（一个容器一个物料）
 *
 * 在真实浏览器 + 真实 import() 时序下验证 loader 会话机制：
 * 同一容器连续两次 mountWidget，第二次取消第一次，最终只渲染第二个物料，
 * 迟到的第一个物料不产生任何 DOM 残留，也无未捕获异常。
 */

// 等待 window.__loader 就绪（main.js 异步动态 import）
async function waitForLoader(page) {
  await page.waitForFunction(() => !!window.__loader, null, { timeout: 10_000 });
}

function dataUrl(code) {
  return 'data:text/javascript,' + encodeURIComponent(code);
}

test.describe('挂载竞态（一个容器一个物料）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForLoader(page);
  });

  test('同容器连续挂载：第二次取消第一次，最终只渲染第二个物料', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const fastUrl = dataUrl('export default { mount(c){ c.innerHTML="<div class=winner>second</div>"; return { unmount(){ c.innerHTML=""; } }; } };');
    const result = await page.evaluate(async (u) => {
      const { mountWidget } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      // 第一个物料走真实 URL（import 至少一个异步窗口）
      const p1 = mountWidget(container, {
        name: 'raceSlow',
        url: '/widgets/vue3/user-panel.js',
        css: '/widgets/vue3/user-panel.css'
      });
      // 同步发起第二次挂载：取消第一个会话
      await mountWidget(container, { name: 'raceFast', url: u });
      await p1;
      // 给迟到的第一个物料留出 resolve 后反向卸载的时间
      await new Promise((r) => setTimeout(r, 500));

      return {
        winner: !!container.querySelector('.winner'),
        loserDom: !!container.querySelector('.user-panel')
      };
    }, fastUrl);

    expect(result.winner).toBe(true);
    expect(result.loserDom).toBe(false);
    expect(errors).toEqual([]);
  });

  test('unmountContainer 取消进行中的挂载，容器无残留', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const result = await page.evaluate(async () => {
      const { mountWidget, unmountContainer } = window.__loader;
      const container = document.createElement('div');
      document.body.appendChild(container);

      const p = mountWidget(container, {
        name: 'toCancel',
        url: '/widgets/vue3/user-panel.js',
        css: '/widgets/vue3/user-panel.css'
      });
      unmountContainer(container); // 同步取消：import 在途
      await p;
      await new Promise((r) => setTimeout(r, 500));

      return { html: container.innerHTML };
    });

    expect(result.html).toBe('');
    expect(errors).toEqual([]);
  });
});
