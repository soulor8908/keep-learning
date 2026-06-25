# 运行时核心模块单元测试 Spec

> change-id: `add-runtime-module-unit-tests`

## Why

下列运行时模块直接影响生产物料行为，目前完全无测试：

1. **i18n**：locale 回退链（zh-CN→zh→en→zh）顺序、addMessages 深合并策略、setLocale 通过 widget-bus 广播 locale-change。回退顺序一旦回归，物料会显示错乱文案甚至 key 本身。
2. **widget-context**：onChange 订阅是物料响应基座上下文变化的唯一通道，订阅清理若泄漏会导致物料卸载后仍触发回调。
3. **widget-registry**：承担远程 registry JSON 归一化（数组/对象两种格式），字段缺失兜底若回归会导致物料加载失败。
4. **widget templates（vue2/vue3/h5 widget-wrapper.js）**：物料项目入口模板，承担 config attribute 解析容错、light DOM 挂载、scope 注入、生命周期映射、disconnected 清理。
5. **ai-assistant cli**：含 path traversal 防护（`WIDGET_NAME_RE`）与文件写回逻辑，是安全相关逻辑，无测试意味着规则被改坏也无法发现（如正则放宽到允许 `../`，AI 生成内容覆盖任意路径文件）。

## What Changes

- 为 `wc/i18n/index.js` 补测试：回退链顺序、addMessages 深合并（嵌套对象不互相覆盖）、setLocale force 参数、onLocaleChange 订阅与取消。
- 为 `wc/widget-context/index.js` 补测试：浅比较跳过、onChange 触发、取消订阅后不再触发、context 快照只读。
- 为 `wc/widget-registry/index.js` 补测试：数组格式归一化、对象格式原样返回、缺 name/js 字段兜底。
- 为 `wc/{vue2,vue3,h5}-widget-template/widget-wrapper.js` 补端到端用例（happy-dom + customElements）：mount/unmount/config 变化/disconnected 清理、config JSON.parse 失败返回 `{}`、h5 createMinimalScope fetch 不可用兜底、vue3 shadowRoot 告警分支。
- 为 `wc/ai-assistant/cli.js` 补安全测试：`WIDGET_NAME_RE` 拒收 `../`/`/abs`/空/特殊字符、未配置 AI_API_KEY 时仅打印 Prompt 不发请求、文件写回路径校验。

## Scope

### In Scope
- 上述模块的单元/端到端测试。
- 复用 vitest + happy-dom；widget template 测试用 happy-dom 提供 customElements。
- 必要的最小可测性重构（提为可导出），不改对外行为。

### Non-Goals
- 不改 i18n/context/registry 的对外 API 与语义。
- 不改 widget template 的挂载机制。
- ai-assistant 的实际 AI 请求不发真实网络调用（mock fetch / 全局 fetch）。

## ADDED Requirements

### Requirement: i18n 回退链与广播
The system SHALL be verified by tests that i18n resolves keys via the locale fallback chain and broadcasts locale changes.

#### Scenario: 回退链顺序
- **WHEN** 当前 locale 为 zh-CN 且仅注册了 zh 与 en 文案
- **THEN** 按 zh-CN→zh→en→zh 顺序回退命中

#### Scenario: setLocale 广播
- **WHEN** 调用 setLocale('en')
- **THEN** 通过 widget-bus 广播 locale-change，onLocaleChange 订阅者被触发

### Requirement: widget-context 订阅与清理
The system SHALL be verified by tests that context onChange fires on change and stops after unsubscribe.

#### Scenario: 取消订阅后不再触发
- **WHEN** 调用返回的 off() 后再更新 context
- **THEN** 回调不再被触发

### Requirement: widget-registry 归一化
The system SHALL be verified by tests that registry normalizes both array and object remote formats with field fallbacks.

#### Scenario: 缺 name/js 兜底
- **WHEN** 远程返回的条目缺 js 字段
- **THEN** 归一化时兜底处理，不抛错

### Requirement: widget template 挂载与清理
The system SHALL be verified by tests that the three widget templates mount, update config, and clean up on disconnect.

#### Scenario: config parse 失败容错
- **WHEN** config attribute 为非法 JSON
- **THEN** 解析返回 `{}` 不抛错

### Requirement: ai-assistant 安全防护
The system SHALL be verified by tests that cli rejects path-traversal widget names and never writes outside the target dir.

#### Scenario: 拒收路径穿越名
- **WHEN** WIDGET_NAME 含 `../` 或绝对路径
- **THEN** 被正则拒收，不发起请求与写文件

## MODIFIED Requirements
无

## REMOVED Requirements
无
