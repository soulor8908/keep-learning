# 项目 Spec 规范初始化 Spec

## Why

当前项目缺少统一的 spec 驱动开发流程，导致需求传递、实现和验收标准不一致。通过建立 `.trae/specs` 规范，让每次变更都有可追溯的 Why/What/How，减少返工和沟通成本。

## What Changes

- 创建 `.trae/specs/` 目录结构，作为所有变更的 spec 仓库
- 定义统一的 spec 文档模板：`spec.md`、`tasks.md`、`checklist.md`
- 定义 change-id 命名规范：动词开头、小写、短横线连接，如 `add-i18n-support`
- 定义 Spec Mode 工作流：写 spec → 用户确认 → 子代理实施 → 按 checklist 验收
- **BREAKING**: 未来所有非 trivial 的代码变更都需要先写 spec，再进入实现阶段

## Impact

- Affected specs: 所有新增或修改的功能都需要遵循本规范
- Affected code: `.trae/specs/` 目录、`README.md`（补充开发流程说明）

## ADDED Requirements

### Requirement: Spec 目录结构
The system SHALL provide a dedicated directory `.trae/specs/<change-id>/` for every discrete change.

#### Scenario: 新功能开发
- **WHEN** 用户提出一个新的功能需求
- **THEN** AI 创建一个唯一的 `change-id` 目录，并在其中写入 `spec.md`、`tasks.md`、`checklist.md`

### Requirement: Spec 文档模板
The system SHALL use the following three documents for every change:

- `spec.md`: 描述 Why / What Changes / Impact / ADDED/MODIFIED/REMOVED Requirements
- `tasks.md`: 拆分为可验证、可并行的任务列表，标注依赖关系
- `checklist.md`: 验收清单，用于实现后逐项验证

#### Scenario: 用户要求实现某功能
- **WHEN** AI 完成 spec 编写
- **THEN** 调用 `NotifyUser` 请求用户确认，确认后才进入实现阶段

### Requirement: 实现与验收分离
The system SHALL delegate implementation to specialized sub-agents and verify against `checklist.md` before declaring completion.

#### Scenario: 实施阶段
- **WHEN** spec 被用户批准
- **THEN** AI 使用 `TodoWrite` 同步任务状态，并调用子代理并行执行无依赖任务
- **AND THEN** 按 `checklist.md` 逐项验收，未通过则创建修复任务重新实施

## MODIFIED Requirements

无

## REMOVED Requirements

无
