# Tasks

- [x] Task 1: 调研 ElementUI 包体积与分包可行性
  - [x] SubTask 1.1: 统计 element-ui 和 element-plus 全量与常用组件的 gzip 体积
  - [x] SubTask 1.2: 验证 element-ui / element-plus 官方是否支持按组件单独引入 JS 与 CSS
  - [x] SubTask 1.3: 列出按组件分包的技术方案（unplugin-vue-components、手动拆包、官方 es 目录）

- [x] Task 2: 设计注册表驱动的按需加载架构
  - [x] SubTask 2.1: 设计 `schema.json` 中 `uiDependencies` 字段格式（含 Vue 2/Vue 3 区分）
  - [x] SubTask 2.2: 设计基座预加载流程：解析注册表 → 收集所需组件 → 去重 → 并行加载 → 挂载 widget
  - [x] SubTask 2.3: 设计组件 chunk 的 URL 规范与缓存策略
  - [x] SubTask 2.4: 设计降级方案（全量回退、错误占位、缺失提示）

- [x] Task 3: 评估替代方案并输出推荐结论
  - [x] SubTask 3.1: 对比方案 A（物料侧按需）、方案 B（基座全量）、方案 C（注册表按需）、方案 D（unplugin 自动按需）
  - [x] SubTask 3.2: 从性能、复杂度、可维护性、兼容性四个维度评分
  - [x] SubTask 3.3: 输出推荐方案与实施路线图

- [x] Task 4: 编写方案设计文档
  - [x] SubTask 4.1: 在 `docs/elementui-on-demand-loading.md` 中记录调研数据、架构图、方案对比与推荐结论
  - [x] SubTask 4.2: 更新 `docs/elementui-migration-strategy.md`，引用并补充按需加载章节

- [x] Task 5: 验证设计文档
  - [x] SubTask 5.1: 检查 Markdown 语法与内部链接
  - [x] SubTask 5.2: 确认文档中的体积数据、URL 示例、配置示例合理可落地

# Task Dependencies

- Task 2 依赖 Task 1
- Task 3 依赖 Task 1 和 Task 2
- Task 4 依赖 Task 3
- Task 5 依赖 Task 4
