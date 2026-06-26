// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright E2E 配置
 *
 * 覆盖 demo 基座的物料加载链路（vue3-host / vue2-host）。
 *
 * 基座启动说明（webServer 暂不自动拉起，见文件末注释）：
 *   - vue3-host:  cd demo/vue3-host && npm run build && npx vite preview --port 4173 --strictPort
 *                 （或开发态：npm run serve，默认端口 5173）
 *   - vue2-host:  cd demo/vue2-host && npm run serve （默认端口 8080）
 *   - 物料产物需预构建并放置到 demo/vue3-host/public/widgets/ 与 demo/vue2-host/public/widgets/
 *
 * 当 baseURL 不可达时，测试会自动 skip 而非硬失败（见 e2e/*.spec.js 中的可达性检查）。
 */
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    // 默认指向 vue3-host 的 vite preview 产物；可用 E2E_BASE_URL 覆盖
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    // CI 与无显示环境一律 headless；本地可用 `npx playwright test --headed` 覆盖
    launchOptions: {
      headless: true,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // ─── webServer（暂不强制自动启动）──────────────────────────────────
  // demo 基座启动链路较复杂：需先构建各 widget-lib 的 UMD 产物并拷贝到对应 host 的
  // public/widgets/，再构建并 preview 基座。为避免在未准备物料产物时硬阻塞测试，
  // 这里不启用自动 webServer，改为在测试内做可达性检查 + skip。
  //
  // 如需本地一键拉起 vue3-host，可取消下方注释（需确保 public/widgets/ 已就绪）：
  //
  // webServer: {
  //   command: 'npm run build && npx vite preview --port 4173 --strictPort',
  //   url: 'http://localhost:4173',
  //   cwd: path.resolve(__dirname, 'demo/vue3-host'),
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
