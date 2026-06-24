# 完善项目文档与 ElementUI 替换策略 Spec

## Why

1. 当前 README 对项目架构、widget 加载机制、迁移流程的介绍不够系统，新成员难以快速理解。
2. 项目中的 `aui` 是内部统一组件库，但在实际业务中可能需要替换为 ElementUI。ElementUI 分为 Vue 2 版的 `element-ui` 和 Vue 3 版的 `element-plus`，替换时必须考虑版本对齐、按需引入、基座 external 化等问题，否则会导致物料重复打包或运行时冲突。

## What Changes

- 重构并扩展 [README.md](file:///workspace/README.md)，深入浅出介绍：
  - 项目定位与核心概念（host / widget / widget-loader / widget-wrapper-plugin）
  - 目录结构与各模块职责
  - 快速开始（构建与本地预览）
  - 物料迁移与打包流程
  - Spec 驱动开发工作流
- 新增架构文档 `docs/architecture.md`，聚焦技术实现：
  - Vue 2 / Vue 3 双版本 host 与 widget 的隔离机制
  - 资源加载、版本契约、错误边界、生命周期
  - 基座 external 依赖设计
- 新增 `docs/elementui-migration-strategy.md`，输出 ElementUI 替换 `aui` 的方案：
  - Vue 2 用 `element-ui`，Vue 3 用 `element-plus`
  - 按需引入的两种模式（物料侧按需、基座全量+外部化）
  - 基座统一提供与版本锁定策略
  - 迁移实施步骤与回退方案
- **BREAKING**: 文档结构调整后，旧文档链接需要同步更新；ElementUI 替换方案若实施，将改变物料项目的依赖声明与打包配置。

## Impact

- Affected specs: 未来所有涉及文档和组件库替换的变更
- Affected code: `README.md`、新增 `docs/architecture.md`、新增 `docs/elementui-migration-strategy.md`

## ADDED Requirements

### Requirement: README 深入浅出
The system SHALL provide an expanded README.md that explains the project architecture and workflow in plain language.

#### Scenario: 新成员阅读 README
- **WHEN** 用户打开 README.md
- **THEN** 能在 5 分钟内理解项目是什么、能做什么、如何本地运行、如何迁移一个组件

### Requirement: 架构文档
The system SHALL provide a dedicated architecture document that covers the dual Vue runtime design.

#### Scenario: 开发者需要理解 widget 加载机制
- **WHEN** 用户阅读 docs/architecture.md
- **THEN** 能清楚了解 host 如何加载 widget、版本契约如何工作、错误边界如何隔离故障

### Requirement: ElementUI 替换策略文档
The system SHALL provide a migration strategy document for replacing `aui` with ElementUI across Vue 2 and Vue 3 widgets.

#### Scenario: 业务团队决定使用 ElementUI
- **WHEN** 用户阅读 docs/elementui-migration-strategy.md
- **THEN** 能明确选择 element-ui 还是 element-plus、如何配置按需引入、如何由基座统一提供运行时、如何逐步迁移

## MODIFIED Requirements

无

## REMOVED Requirements

无
