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
├── package.json              # 根依赖（测试工具）
├── scripts/                  # Coze 脚本
│   ├── coze-preview-build.sh # 预览构建
│   ├── coze-preview-run.sh   # 预览运行
│   ├── h5-preview-build.sh   # H5 预览构建
│   ├── h5-preview-run.sh     # H5 预览运行
│   ├── deploy_build.sh       # 部署构建
│   └── deploy_run.sh         # 部署运行
├── demo/                     # 子项目
│   ├── h5-widget-lib/        # H5 原生物料库
│   ├── vue2-host/            # Vue2 基座
│   ├── vue3-host/            # Vue3 基座（主预览入口）
│   ├── vue2-widget-lib/      # Vue2 物料库
│   └── vue3-widget-lib/      # Vue3 物料库
└── wc/                       # Web Components 运行时核心
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

## 核心 API（精简后）

| 模块 | 导出 | 说明 |
|------|------|------|
| widget-bus | `createBus(namespace?)` | 创建消息总线实例 |
| widget-scope | `createWidgetScope({name, busInstance?})` | 创建物料 scope |
| widget-loader | `WidgetLoader`, `createWidgetLoader()` | 物料加载器 |
| ui-loader | `preloadUiDependencies()` | ElementPlus 按需预加载 |
| shared/props | `camelToKebab`, `parseAttrValue` | 主机端共享工具 |

## 运行与预览
```bash
# 安装根依赖
pnpm install

# 预览 vue3-host
bash scripts/coze-preview-run.sh

# 预览 h5-widget-lib
bash scripts/h5-preview-run.sh

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
- **widget-bus 只导出 createBus**：删除 Vue2BusPlugin/Vue3BusPlugin/window.widgetBus 等向后兼容导出，新项目不需要
- **widget-page 已删除**：2C 看板是单页面，不需要多页面状态机编排
- **h5-vite-plugin 已合并到 vite-plugin**：通过 `mode: 'h5'` 选项区分，消除重复代码
- **ui-loader 从 loader 中拆出**：UI 按需加载是可选能力，不混在核心 loader 里
- **declarative-plugin 删除 babel-plugin**：只保留 vite-plugin，新项目统一用 Vite
