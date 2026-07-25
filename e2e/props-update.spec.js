import { test, expect } from '@playwright/test';

/**
 * Props 热更新 E2E（WidgetHost → api.update）
 *
 * 验证点不是「文案变了」（重挂载也能做到），而是「文案变了且物料内部状态还在」——
 * 状态保留是热更新区别于重挂载的唯一可观察特征：
 * - Vue2 物料：data 桥（app.p = next）触发重渲染，组件实例不重建
 * - Vue3 物料：shallowRef 桥（propsRef.value = next）触发重渲染，setup 内 ref 状态保留
 */

test.describe('Props 热更新（状态保留）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dashboard__card')).toHaveCount(6, { timeout: 30_000 });
    await expect(page.locator('.widget-host.sales-panel .sales-panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.widget-host.finance-panel .finance-panel')).toBeVisible({ timeout: 30_000 });
  });

  test('Vue2 物料：切换语言后文案更新且内部状态保留', async ({ page }) => {
    const panel = page.locator('.widget-host.sales-panel');

    // 先制造内部状态：添加一行（tableData 3→4，eventLog 0→1）
    await panel.locator('.el-button:has-text("添加记录")').click();
    await expect(panel).toContainText(/事件:\s*1/);
    await expect(panel.locator('.el-table__row')).toHaveCount(4);

    // 切换语言 → widgetProps 变化 → WidgetHost 走 api.update 热更新
    await page.locator('.dashboard__header .el-button').click();

    // 文案已更新为英文（props 生效）
    await expect(panel).toContainText(/Events:\s*1/);
    // 状态保留：仍是 4 行（若是重挂载会重置回初始 3 行）
    await expect(panel.locator('.el-table__row')).toHaveCount(4);
  });

  test('Vue3 物料：切换语言后文案更新且内部状态保留', async ({ page }) => {
    const panel = page.locator('.widget-host.finance-panel');

    // 制造内部状态：刷新一次（eventLog 0→1）
    await panel.locator('.el-button:has-text("刷新数据")').click();
    await expect(panel).toContainText(/事件:\s*1/);

    await page.locator('.dashboard__header .el-button').click();

    // 英文文案 + 事件计数仍是 1（重挂载会清空 eventLog，计数标签消失）
    await expect(panel).toContainText(/Events:\s*1/);
  });

  test('来回切换语言物料不重复挂载（事件计数持续累积）', async ({ page }) => {
    const panel = page.locator('.widget-host.finance-panel');

    await panel.locator('.el-button:has-text("刷新数据")').click();
    await expect(panel).toContainText(/事件:\s*1/);

    // zh → en → zh 两次切换
    await page.locator('.dashboard__header .el-button').click();
    await expect(panel).toContainText(/Events:\s*1/);
    await page.locator('.dashboard__header .el-button').click();
    await expect(panel).toContainText(/事件:\s*1/);

    // 再刷新一次：计数在已有状态上累积到 2（证明两次切换都没重挂载）
    await panel.locator('.el-button:has-text("刷新数据")').click();
    await expect(panel).toContainText(/事件:\s*2/);
  });
});
