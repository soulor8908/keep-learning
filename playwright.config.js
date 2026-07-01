// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

/**
 * Playwright E2E 配置（纯 ESM + importmap）
 *
 * 覆盖 demo/host 基座：验证 Vue2/Vue3/H5 物料在同一页面共存。
 * 依赖隔离由 importmap scopes 处理，加载由浏览器原生 import() 完成，无 window 全局变量。
 */
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5000',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    launchOptions: {
      headless: true
    }
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  // CI 自动构建物料（ESM）并启动 host dev server
  webServer: {
    command: 'bash scripts/e2e-serve.sh',
    url: 'http://localhost:5000',
    cwd: path.resolve(__dirname),
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
