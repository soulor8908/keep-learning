# E2E 测试（Playwright）

覆盖 demo 基座的物料加载链路，验证 Custom Element 注册、props 注入、加载失败降级、跨物料 widget-bus 通信，以及 Vue2/Vue3 双运行时共存。

## 环境准备

E2E 测试需要真实运行的基座与预构建的物料产物，**不会自动构建/启动**。

### 1. 预构建物料产物

构建各 widget-lib 的 UMD 产物，并将 `dist/` 下的 `bi-*.js` 拷贝（或软链）到对应基座的 `public/widgets/`：

```bash
# 示例：vue3 物料
cd demo/vue3-widget-lib && npm run build
cp dist/*.js ../vue3-host/public/widgets/

# vue2 / h5 物料同理
cd demo/vue2-widget-lib && npm run build
cp dist/*.js ../vue2-host/public/widgets/
```

> 基座通过 `/widgets/<name>.js` 相对路径加载物料（见 `demo/*/src/widgetRegistry.js`），故产物必须放在基座的 `public/widgets/` 下。

### 2. 启动基座

```bash
# vue3-host（Vite）
cd demo/vue3-host && npm run build && npx vite preview --port 4173 --strictPort
# 或开发态（端口 5173）：npm run serve

# vue2-host（Vue CLI，端口 8080）
cd demo/vue2-host && npm run serve
```

### 3. 安装浏览器

```bash
npm run e2e:install          # 仅安装 chromium
# 或：npx playwright install chromium
```

## 运行测试

```bash
npm run e2e                  # 运行全部 e2e 用例
npm run e2e -- --headed      # 本地有头模式
npm run e2e:report           # 查看 HTML 报告
```

### 覆盖范围

| 文件 | 用例 | 说明 |
| --- | --- | --- |
| `widget-loading.spec.js` | 物料 custom element 正确注册 | 访问 vue3-host，断言 `bi-filter-bar` 已在 `customElements` 注册 |
| | 物料 props 通过 attribute 注入 | 断言 `title` / `filters` 等 attribute 正确写入并渲染 |
| | 物料加载失败显示降级占位 | 拦截脚本请求触发失败，断言 `.widget-error-placeholder` 出现 |
| | 跨物料通信 widget-bus | 模拟 emit 事件，断言 host 日志面板收到 |
| `multi-host.spec.js` | vue2-host 加载 Vue2 物料 | 断言 `window.Vue2` 存在、物料渲染 |
| | vue3-host 加载 Vue3 物料 | 断言 `window.Vue3` 存在、物料渲染 |

### 配置项

- `playwright.config.js`：testDir `./e2e`，仅 chromium，CI 下单 worker + 2 次重试，`trace: 'on-first-retry'`。
- 基座地址可通过环境变量覆盖：
  - `E2E_BASE_URL`：vue3-host（widget-loading 用，默认 `http://localhost:4173`）
  - `E2E_VUE2_BASE_URL`：vue2-host（默认 `http://localhost:8080`）
  - `E2E_VUE3_BASE_URL`：vue3-host（multi-host 用，默认 `http://localhost:4173`）

## CI 集成注意事项

1. **基座不可达自动 skip**：每个用例前都会做可达性检查，未启动基座时用例 skip 而非硬失败。CI 若要真正执行，须在测试前启动基座（建议用 `webServer` 或单独 step）。
2. **webServer 未启用**：因物料产物预构建链路较复杂，`playwright.config.js` 未启用自动 `webServer`（见文件内注释块，可按需取消注释）。CI 中建议单独 step 构建物料 + 启动 preview server 后再跑 e2e。
3. **浏览器**：CI 需先 `npm run e2e:install` 或使用官方 `microsoft/playwright` Action 预装浏览器。无浏览器环境用例无法执行。
4. **与单元测试隔离**：`npx vitest run` 的 include 仅匹配 `wc/**/__tests__/*.test.js`，不会收集 `e2e/*.spec.js`，两者互不影响。
5. **headless**：配置默认 headless；本地调试可加 `--headed`。
