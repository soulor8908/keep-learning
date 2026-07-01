# E2E 测试

覆盖 `demo/host` 统一基座，验证纯 ESM 方案下 Vue2 / Vue3 / H5 物料在同一页面共存，以及 importmap 注入、依赖隔离、错误降级、产物体积等核心能力。

## 运行

```bash
pnpm e2e
```

测试会自动构建物料（`pnpm build:widgets`）并启动 host dev server（端口 5000，Playwright webServer 托管）。

> 单次只跑某个 spec：`CI=1 npx playwright test e2e/host.spec.js --reporter=list`

## 测试用例

### `host.spec.js` — 基座渲染与交互

- Vue2 / Vue3 / H5 物料在同一页面渲染（六张卡片）
- 页面标题和基座头部渲染正确
- importmap 已注入到页面（含 scopes 隔离映射）
- H5 时钟组件实时更新时间
- 页面无未捕获异常
- 切换语言按钮可点击
- Vue2 物料按钮点击触发 `widget:refresh` 事件
- 六个物料区域互不干扰
- 纯 ESM 方案不使用 window 全局变量（`window.Vue2/Vue3/ElementPlus/ELEMENT` 均为 undefined）
- Vue2 和 Vue3 物料使用不同版本的 Vue（通过 importmap scope 隔离，各自 el-table 独立工作）

### `error-handling.spec.js` — 错误降级

- ESM 模块 404 时显示错误占位
- 物料未导出 mount 方法时显示错误占位
- mount() 执行异常时显示错误占位
- CSS 加载失败时显示错误占位
- 重试按钮重新触发挂载
- 一个物料失败不影响其他物料正常渲染
- unmountWidget 对各种输入不抛异常
- unmountWidget 正确调用 api.unmount() 并清空容器
- 成功加载后返回包含 unmount 的 API
- 同一模块 URL 命中缓存不重复加载

> 这些用例通过 `window.__loader`（`demo/host/src/main.js` dev 期注入，生产构建 tree-shake）直接调用 `mountWidget` / `unmountWidget`，并用 `data:text/javascript` URL 构造模拟物料模块。

### `bundle-size.spec.js` — 产物体积与结构校验

- 各物料 ESM 产物体积在阈值内（Vue2 < 8KB、Vue3 < 8KB、H5 < 4KB、总量 < 30KB）
- 浏览器加载的 JS/CSS 资源体积在阈值内（单文件 < 8KB）
- `esm/` 临时目录已删除（纯 ESM 方案已合并到 `wc/`）
- 物料产物不含 UMD 文件
- 物料 `manifest.json` 声明 `format: 'esm'`
- 核心运行时行数在阈值内（loader.js / WidgetHost.vue / templates）

## 注意事项

- 物料通过 `dynamic import()` + esm.sh CDN 加载，首屏需要等待远程模块图拉取完成。`beforeEach` 用 `waitForSelector` 等待六张卡片渲染完成（超时 30s），比固定 sleep 更可靠。
- CDN 不可达时测试会超时失败。离线/内网环境可通过 `UI_CDN_BASE` 环境变量改指向自托管 ESM。
- `demo/*` 目录不在根 pnpm workspace 内，`scripts/e2e-serve.sh` 用 `--ignore-workspace --no-frozen-lockfile` 独立安装依赖。
