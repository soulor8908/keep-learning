# WC 物料架构 API 文档

本站点由 [JSDoc](https://jsdoc.app/) 从 `wc/` 目录源码中的 JSDoc 注释自动生成，覆盖跨技术栈看板物料集成方案的全部公开 API。

## 文档说明

`wc/` 是一套基于 Web Components / Custom Elements 的轻量集成方案，将不同部门、不同技术栈（Vue2 / Vue3 / 原生 H5）的物料组件以统一方式接入到同一个 BI 看板基座中。

核心架构决策：

- **Custom Elements + light DOM**：物料包装为 Custom Element，禁用 Shadow DOM（避免隔离 ElementUI / ElementPlus 全局样式）。
- **UMD + external**：物料构建为 UMD 格式，Vue / ElementUI / ElementPlus / `wc-i18n` / `wc-widget-scope` 由基座统一 external 提供。
- **扁平化 props 协议**：基座通过独立 kebab-case HTML attribute 传入每个 prop。
- **软隔离（widgetScope）**：每个物料实例创建独立的 `widgetScope` 对象（context/bus/log/t/request/loader）。
- **构建时静态分析**：CSS 命名空间检查、scoped CSS 检查、JS 危险 API 扫描集成到构建钩子。

## 模块清单

| 模块 | 目录 | 说明 |
|------|------|------|
| widget-loader | `wc/widget-loader/` | 基座物料加载器（加载 / 挂载 / 错误隔离 / 版本契约） |
| widget-wrapper-plugin | `wc/widget-wrapper-plugin/` | 自动包装构建插件（Vue2 / Vue3 / H5 + PostCSS 命名空间） |
| widget-bus | `wc/widget-bus/` | 跨技术栈消息总线 |
| widget-scope | `wc/widget-scope/` | 软隔离 scope（context / bus / log / t / request / loader） |
| widget-context | `wc/widget-context/` | 全局上下文（setContext / getContext / injectContext） |
| widget-registry | `wc/widget-registry/` | 远程注册表（拉取 + 缓存 + 降级） |
| widget-declarative-plugin | `wc/widget-declarative-plugin/` | 声明式语法（`$widget` 宏 / JSX `<Widget>`） |
| widget-page | `wc/widget-page/` | 看板页面编排 |
| i18n | `wc/i18n/` | 跨技术栈轻量国际化（zh.js + en.js） |
| schema-generator | `wc/schema-generator/` | schema.json 自动生成 |
| ai-schema-enricher | `wc/ai-schema-enricher/` | schema 智能补全 |
| migration-skill | `wc/migration-skill/` | 迁移技能示例 |
| ai-assistant | `wc/ai-assistant/` | AI 辅助 CLI + 提示词 |
| css-namespace-checker | `wc/css-namespace-checker/` | CSS 命名空间检查 |
| scoped-style-checker | `wc/scoped-style-checker/` | Vue scoped CSS 检查 |
| js-risk-scanner | `wc/js-risk-scanner/` | JS 危险 API 静态扫描 |
| dependency-analyzer | `wc/dependency-analyzer/` | 依赖分析 |
| vue2-widget-template | `wc/vue2-widget-template/` | Vue2 物料模板 |
| vue3-widget-template | `wc/vue3-widget-template/` | Vue3 物料模板 |
| h5-widget-template | `wc/h5-widget-template/` | 原生 H5 物料模板 |

## 如何重新生成

```bash
# 仅生成 API 文档到 docs/api/
npm run docs:api

# 生成并启动本地预览服务（http://localhost:4000）
npm run docs:api:serve
```

生成结果输出到 `docs/api/`（已加入 `.gitignore`，不入库）。

配置文件为仓库根目录的 `jsdoc.conf.json`，扫描范围 `wc/`，排除 `__tests__`、`__stubs__`、`examples`、`dist` 目录及 `node_modules/`，避免测试代码与构建产物进入 API 文档。

## JSDoc 规范要求

依据 `agent.md` §二-3 代码习惯约定，函数需使用 JSDoc 标注：

- `@param {类型} 名称 描述`：参数类型与含义
- `@returns {类型} 描述`：返回值类型与含义
- `@throws {类型} 描述`：可能抛出的异常

注释与文档使用中文，技术术语（PostCSS、AST、Vite、Babel 等）保留英文。详细约定参见仓库根目录 `agent.md`。
