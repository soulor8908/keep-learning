## 项目概述
跨技术栈看板物料集成方案（BI 看板基座 + Vue2/Vue3 双版本物料组件库），通过 Web Components / Custom Elements 把不同技术栈的物料以统一方式接入到同一个看板中。面向 2C 页面，对首屏性能、运行时性能和体积敏感。

## 技术栈
- **框架**：Vue 2/3、Web Components
- **构建工具**：Vite、Vue CLI
- **UI 库**：ElementUI (Vue2)、ElementPlus (Vue3)
- **包管理器**：pnpm
- **测试**：Vitest

## 目录结构
```
/workspace/projects/
├── .coze                    # Coze 项目配置
├── package.json              # 根依赖（测试工具 + concurrently/cross-env）
├── scripts/                  # Coze 脚本
│   ├── coze-preview-build.sh # 预览构建
│   ├── coze-preview-run.sh   # 预览运行
│   ├── h5-preview-build.sh   # H5 预览构建
│   ├── h5-preview-run.sh     # H5 预览运行
│   ├── deploy_build.sh       # 部署构建
│   └── deploy_run.sh         # 部署运行
├── demo/                     # 子项目
│   ├── h5-widget-lib/        # H5 原生物料库
│   ├── vue2-host/            # Vue2 基座（Custom Elements 方案）
│   ├── vue2-widget-lib/      # Vue2 物料库
│   ├── vue3-host/            # Vue3 基座（Custom Elements 方案，主预览入口）
│   ├── vue3-widget-lib/      # Vue3 物料库
│   ├── vue3-esm-host/        # Vue3 基座（ESM 轻量方案）
│   ├── vue3-esm-widget/      # Vue3 ESM 物料
│   └── vue3-esm-h5/          # H5 ESM 物料
└── wc/                       # Web Components 运行时核心
    ├── vue3-esm/             # ESM 轻量方案（Vue3 物料推荐）
    │   ├── loader.js         # import() + 缓存 + locale 自动注册
    │   ├── WidgetHost.js     # 基座组件
    │   └── h5-wrapper.js     # H5 物料包装器
    ├── widget-bus/            # 全局消息总线（createBus 工厂）
    ├── widget-context/        # 上下文管理
    ├── widget-scope/          # 物料软隔离 scope（createWidgetScope）
    ├── widget-loader/         # 物料加载器（WidgetLoader + createWidgetLoader）
    ├── widget-registry/       # 物料注册表
    ├── i18n/                  # 国际化
    ├── ui-loader/             # UI 按需加载（ElementPlus 组件预加载）
    ├── shared/                # 共享工具（props.js: camelToKebab, parseAttrValue）
    ├── widget-wrapper-plugin/ # 构建插件
    │   ├── vite-plugin.js     # 统一 Vite 插件（Vue2 H5/Vue3 共用，mode 区分）
    │   ├── vue-cli-plugin.js  # Vue CLI 插件（Vue2 物料）
    │   └── postcss-namespace.js
    ├── widget-declarative-plugin/ # 声明式物料插件（Vite only）
    ├── h5-widget-template/    # H5 物料包装模板
    ├── vue2-widget-template/  # Vue2 物料包装模板
    └── vue3-widget-template/  # Vue3 物料包装模板
```

## 关键入口 / 核心模块

| 子项目 | 端口 | 入口 | 用途 |
|--------|------|------|------|
| demo/vue3-host | 5000 | index.html | Vue3 基座（主预览） |
| demo/h5-widget-lib | 5000 | index.html | H5 物料预览 |
| demo/vue2-host | - | Vue CLI | Vue2 基座 |
| demo/vue2-widget-lib | - | Vue CLI | Vue2 物料构建 |
| demo/vue3-widget-lib | - | Vite | Vue3 物料构建 |
| demo/vue3-esm-host | 5001 | index.html | Vue3 ESM 轻量基座 |
| demo/vue3-esm-widget | - | Vite | Vue3 ESM 物料构建 |

## 核心 API（精简后）

| 模块 | 导出 | 说明 |
|------|------|------|
| vue3-esm/loader | `mountWidget(container, url, props)` | 轻量加载器，自动注册物料 locale |
| widget-bus | `createBus(namespace?)` | 创建消息总线实例 |
| widget-scope | `createWidgetScope({name, busInstance?})` | 创建物料 scope |
| widget-loader | `WidgetLoader`, `createWidgetLoader()` | 物料加载器 |
| ui-loader | `preloadUiDependencies()` | ElementPlus 按需预加载 |
| shared/props | `camelToKebab`, `parseAttrValue` | 主机端共享工具 |

## 运行与预览
```bash
# 安装根依赖
pnpm install

# 一键启动三个 host（vue3:5173, vue2:8080, vue3-esm:5001）
pnpm dev

# 单独启动某个 host
pnpm dev:vue3-host
pnpm dev:vue2-host
pnpm dev:vue3-esm-host

# 按需启动物料构建 watch（修改物料代码后自动重编译）
pnpm dev:vue3-widget
pnpm dev:vue2-widget
pnpm dev:vue3-esm-widget

# 预览 vue3-host（旧方式，保留兼容）
bash scripts/coze-preview-run.sh

# 构建部署产物
bash scripts/deploy_build.sh

# 启动部署服务
bash scripts/deploy_run.sh
```

## 用户偏好与长期约束
- Node.js 项目统一使用 pnpm 管理依赖
- 预览端口固定为 5000
- 部署入口为 demo/vue3-host
- Web Components 物料需支持离线/内网环境
- 只适配原生 H5、Vue2、Vue3，不做过度设计
- 2C 页面：首屏性能、体积、鲁棒性优先
- 不兼容历史版本，API 可自由迭代

## 预览链路配置
- 根 `.coze` 负责调度子项目脚本
- 子项目 `.coze`（vue3-host, h5-widget-lib）记录各自预览配置
- 脚本基于自身位置定位项目根目录

## 部署链路配置
- `deploy.build`：安装依赖 + 构建 vue3-host
- `deploy.run`：启动静态服务提供 dist 产物
- 端口固定 5000

## 架构决策记录
- **scope.bus 注入全局 bus**：widget-wrapper 通过 `window.__wcGlobalBus__` 将全局 bus 实例传入 `createWidgetScope`，确保 scope.bus 与基座总线共享同一通道，物料 emit 的事件基座可直接 on 到
- **widget-bus 只导出 createBus + createBroadcastBus**：createBus 对外导出，createBroadcastBus 供 widget-context/i18n 内部广播用，不依赖 window.widgetBus 全局变量
- **widget-page 已删除**：2C 看板是单页面，不需要多页面状态机编排
- **h5-vite-plugin 已合并到 vite-plugin**：通过 `mode: 'h5'` 选项区分，消除重复代码
- **ui-loader 从 loader 中拆出**：UI 按需加载是可选能力，不混在核心 loader 里
- **declarative-plugin 只保留 vite-plugin**：babel-plugin.js 作为 vite-plugin 内部实现细节（@private），不对用户导出
- **scope emit/on/off 快捷方法**：scope 上直接提供 emit/on/off 委托到 scope.bus，与 Vue3 emit 心智模型一致
- **vite-plugin/vue-cli-plugin dev-preview 模式**：serve 时自动生成预览入口和页面，无需手写 main.js
- **vue3-esm 方案与 widget-loader 并行存在**：两套方案平等并存，用户根据场景自选；vue3-esm 适合纯 Vue3 轻量场景，widget-loader 适合 Vue2/复杂场景
- **vue3-esm 物料 locale 自动注册**：物料导出 `locale` 对象后，loader 加载时自动调用 `addMessages`，无需手动调用

## 关键运行时全局变量

| 全局变量 | 提供者 | 用途 |
|---------|--------|------|
| `window.Vue2` | vue2-host 基座 | Vue2 物料运行时 |
| `window.Vue3` | vue3-host 基座 | Vue3 物料运行时 |
| `window.ELEMENT` | vue2-host（element-ui.js）、vue3-host（vendor/element-ui.js） | ElementUI 组件库 |
| `window.ElementPlus` | vue3-host（element-plus.js） | ElementPlus 组件库 |
| `window.__wcI18n__` | 基座 | i18n 运行时（物料共享 locale） |
| `window.__wcWidgetScope__` | 基座 | widgetScope 工厂（createWidgetScope） |
| `window.__wcGlobalBus__` | 基座 | 全局 bus 实例（scope.bus 注入用） |

## 代码习惯约定

### 通用规则
1. **语言**：注释与文档用中文，技术术语保留英文。代码标识符用英文。
2. **不使用 emoji**：代码、注释、文档中均不使用 emoji。
3. **注释风格**：解释“为什么”而非“是什么”。用 `// ─── 标题 ───` 分隔符划分区块。函数用 JSDoc。
4. **防御性编码**：系统边界做校验与 try/catch；内部代码信任框架保证；失败不阻断主流程时用 try/catch + console.warn 降级。
5. **不过度工程化**：只做被要求的事；一次性操作不抽 helper；不为假想的未来需求设计。

### 模块实现
1. **ESM 优先**：`wc/` 下用 ESM。需引用 CJS 时用 `createRequire`。
2. **冻结隔离对象**：widgetScope 用 Object.freeze() 冻结。
3. **多 Host 状态隔离**：加载器等用 class 实例化。

### 测试习惯
1. 改完 `.js` 用 `node --check` 验证语法。
2. 测试框架：Vitest（happy-dom 环境）。
3. 临时文件用完即删。

### Git 提交
1. 提交信息：中文，`type(scope): 概述` 格式。
2. 不主动提交，只在用户明确要求时 commit。
