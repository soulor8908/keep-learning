# Tasks

- [x] Task 1: 扩展 README.md，深入浅出介绍项目
  - [x] SubTask 1.1: 撰写项目定位、核心概念与目录结构
  - [x] SubTask 1.2: 撰写快速开始（安装、构建、本地预览）
  - [x] SubTask 1.3: 撰写物料迁移与打包流程说明
  - [x] SubTask 1.4: 保留并润色 Spec 驱动开发工作流章节

- [x] Task 2: 新增架构文档 docs/architecture.md
  - [x] SubTask 2.1: 说明 Vue 2 / Vue 3 双版本 host 与 widget 的隔离机制
  - [x] SubTask 2.2: 说明 widget-loader 的资源加载、版本契约、错误边界、生命周期
  - [x] SubTask 2.3: 说明基座 external 依赖与全局变量设计

- [x] Task 3: 新增 ElementUI 替换策略文档 docs/elementui-migration-strategy.md
  - [x] SubTask 3.1: 对比 element-ui（Vue 2）与 element-plus（Vue 3）版本选择
  - [x] SubTask 3.2: 设计按需引入方案：物料侧按需 vs 基座全量+external
  - [x] SubTask 3.3: 设计基座统一提供与版本锁定方案
  - [x] SubTask 3.4: 输出迁移实施步骤、示例配置与回退方案

- [x] Task 4: 验证文档质量
  - [x] SubTask 4.1: 检查所有文档 Markdown 语法
  - [x] SubTask 4.2: 检查文档内部链接与代码引用是否有效

# Task Dependencies

- Task 2 依赖 Task 1（先确定 README 的目录与术语）
- Task 3 可并行于 Task 2
- Task 4 依赖 Task 1、Task 2、Task 3
