# 验收清单：UI 组件级按需加载

> change-id: `add-ui-on-demand-loading`

## schema-generator

- [ ] `extractUiDependencies` 导出且为纯函数
- [ ] 扫描 `<el-card>` `<el-button>` → `['card','button']`
- [ ] 去重正确
- [ ] 排除闭合标签 `</el-` 与注释
- [ ] 无 el-* 返回 `[]`
- [ ] `generateSchema` 集成：vueVersion='3' → lib='element-plus'、version='^2.7.0'
- [ ] `generateSchema` 集成：vueVersion='2' → lib='element-ui'
- [ ] 无 el-* 时 schema 不含 uiDependencies 字段
- [ ] 向后兼容：options.vueVersion 未传不报错

## widget-loader preloadUiDependencies

- [ ] `preloadUiDependencies` 导出
- [ ] `defaultResolveUiResource` URL 格式：`{cdnBase}/ui/{lib}@{version}/{component}.{ext}`
- [ ] 两物料共用 button 只加载一次（loadedResources 去重）
- [ ] lib 与 vueVersion 不匹配抛 `UI_DEP_LIB_MISMATCH`
- [ ] `full:true` 只加载 full.js/full.css
- [ ] 单组件失败重试 1 次后仍失败不阻断整体
- [ ] 无 uiDependencies 的 widget 被跳过
- [ ] 返回 `{loaded, failed}` 结构

## 不变性

- [ ] 既有 69 个测试不回归
- [ ] 不修改 demo 源码
- [ ] 不改动 widget-wrapper-plugin（向后兼容）
- [ ] 既有 `generateSchema`/`writeSchema` 签名不变（只增 options 字段）
