# 验收清单：构建期工具链单元测试

> change-id: `add-build-tooling-unit-tests`

## widget-wrapper-plugin
- [ ] external 映射测试存在（vue2/vue3/h5 三套）
- [ ] wrapper 文件生成结构测试存在
- [ ] postcss-namespace 覆盖普通选择器/全局白名单/@media/@keyframes 四类分支
- [ ] 可测性重构未改变对外行为

## 构建期检查器
- [ ] css-namespace-checker 通过/拒收/边界三组用例
- [ ] js-risk-scanner 通过/拒收/边界三组用例
- [ ] scoped-style-checker scoped/namespace 双策略用例
- [ ] dependency-analyzer 冲突与版本不兼容用例

## widget-declarative-plugin
- [ ] babel-plugin 宏/JSX/.vue script 转换用例
- [ ] vite-plugin 三层回退链用例
- [ ] runtime widgetMount mount/unmount/config 用例

## 运行验收
- [ ] `npm run test:run` 全绿
- [ ] 既有 97 用例不被破坏
- [ ] 新增用例数 ≥ 60
- [ ] vitest include glob 已纳入新测试目录
