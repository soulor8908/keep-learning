# aui 组件库迁移至 ElementUI 策略

> **注：迁移已完成。本文档保留作为历史记录与回滚参考。当前项目已全面使用 ElementUI/ElementPlus，aui 相关代码已移除。**

## 1. 版本选择

### 1.1 选择规则

| 物料（widget）类型 | 对应 UI 库 | 全局变量 | 基座注入方 |
| --- | --- | --- | --- |
| Vue 2 物料 | `element-ui` | `ElementUI` | `vue2-host` |
| Vue 3 物料 | `element-plus` | `ElementPlus` | `vue3-host` |

### 1.2 为什么不能混用 element-ui 与 element-plus

- **Vue 版本强绑定**：`element-ui@2.x` 只兼容 Vue 2.x，`element-plus` 只兼容 Vue 3.x，二者对 Vue 内部 API（响应式系统、VNode、事件模型、生命周期）依赖完全不同。
- **全局注册冲突**：两套组件库都会调用 `app.use(...)` / `Vue.use(...)` 注册同名组件（如 `el-button`、`el-input`）。如果同时挂载到同一页面，后注册的会覆盖前者或导致运行时异常。
- **样式冲突**：两套组件库都包含各自的 CSS 变量、字体图标与工具类，同时加载会导致样式覆盖、图标丢失、主题错位。
- **全局状态冲突**：Message、MessageBox、Loading 等插件会向 `Vue.prototype`（Vue 2）或 `app.config.globalProperties`（Vue 3）注入实例方法，混用会污染全局对象。

因此，基座必须按 Vue 主版本分别提供 **element-ui** 或 **element-plus**，物料严禁在构建产物中内置任一 UI 库。

---

## 2. 两种按需引入方案对比

### 2.1 方案 A：物料侧按需引入

在 widget 构建时通过 `babel-plugin-component`（Vue 2）或 `unplugin-vue-components` + `unplugin-auto-import`（Vue 3）只打包用到的组件。

#### Vue 2 示例（babel-plugin-component）

```js
// babel.config.js
module.exports = {
  plugins: [
    [
      'component',
      {
        libraryName: 'element-ui',
        styleLibraryName: 'theme-chalk'
      }
    ]
  ]
};
```

```js
// 物料源码
import { Button, Input } from 'element-ui';
export default {
  components: { ElButton: Button, ElInput: Input }
};
```

#### Vue 3 示例（unplugin-vue-components）

```js
// vite.config.js
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default {
  plugins: [
    vue(),
    Components({
      resolvers: [ElementPlusResolver()]
    })
  ]
};
```

#### 方案 A 优点

- 单个 widget 构建产物体积小，组件用多少打多少。
- 不依赖基座是否预装 ElementUI。

#### 方案 A 缺点

- 同一页面运行多个 widget 时，组件、CSS、图标会重复打包多次，造成总包体积膨胀。
- 主题与样式难以统一：每个 widget 可能引入不同版本、不同主题变量。
- 需要每个 widget 单独维护按需引入配置，迁移成本高。
- 与基座提供的公共依赖契约相冲突（当前 `widget-loader` 要求公共依赖由基座统一提供）。

> **结论**：方案 A 适合完全独立部署的微前端应用，不适合本项目“基座统一提供公共依赖”的 widget 架构。

---

### 2.2 方案 B：基座提供完整 ElementUI 全局包 + 物料构建 externalize

基座在页面启动时加载完整 `element-ui` 或 `element-plus`（含 CSS 与图标），物料构建时将 UI 库标记为 `external`，运行时从 `window.ElementUI` / `window.ElementPlus` 读取。

#### 方案 B 优点

- 多个 widget 共享同一份 UI 库缓存，避免重复加载。
- 主题、字体、语言包由基座统一配置，确保视觉与行为一致。
- 迁移后的 widget 只需要修改源码中的组件标签与 API，构建配置统一。
- 与现有 `widget-loader` 的 `SUPPORTED_DEPS` 版本契约模型完全兼容。

#### 方案 B 缺点

- 基座首屏需要加载完整 UI 库，首次加载体积比方案 A 单 widget 大（但多 widget 场景下总体积更小）。
- 所有 widget 必须锁定在同一 ElementUI 版本，升级需统一回归。
- 需要保证 element-ui 与 element-plus 的全局变量名不冲突。

> **结论**：方案 B 更契合当前基座-物料分离、公共依赖由基座托管的架构，推荐采用。

---

## 3. 推荐方案：基座提供完整 ElementUI 作为外部全局变量

### 3.1 核心原则

1. **基座负责加载**：`vue2-host` 引入并全局注册 `element-ui`；`vue3-host` 引入并全局注册 `element-plus`。
2. **物料只引类型/API**：widget 源码中按原组件标签使用（如 `<el-button>`），构建时 `element-ui` / `element-plus` 走 `external`，不进入产物。
3. **CSS 由基座统一注入**：widget 产物中不再包含 ElementUI 的 CSS，避免重复与冲突。
4. **版本由 `SUPPORTED_DEPS` 约束**：`widget-loader` 在加载 widget 前校验基座是否提供兼容版本。

### 3.2 物料使用方式

```vue
<template>
  <el-button type="primary" @click="onClick">
    <el-icon><Search /></el-icon>
    搜索
  </el-button>
</template>

<script>
// 仅作为类型/编译提示引入，不打包到产物
import { ElButton, ElIcon } from 'element-ui';

export default {
  name: 'SampleWidget',
  // Vue 2 需要显式注册组件（除非基座已全局注册）
  components: { ElButton, ElIcon }
};
</script>
```

如果基座已经 `Vue.use(ElementUI)` 全局注册，则物料模板中可直接写 `<el-button>`，无需在 `components` 中声明。

---

## 4. 基座注入设计

### 4.1 vue2-host 注入 element-ui

```js
// demo/vue2-host/src/main.js
import Vue from 'vue';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';

Vue.use(ElementUI);

// 暴露到 window，供 widget-loader 校验与 widget 产物使用
window.Vue2 = Vue;
window.ElementUI = ElementUI;
```

```json
// demo/vue2-host/package.json
{
  "dependencies": {
    "vue": "^2.6.14",
    "vue-i18n": "^8.28.2",
    "element-ui": "^2.15.14"
  }
}
```

### 4.2 vue3-host 注入 element-plus

```js
// demo/vue3-host/src/main.js
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';

const app = createApp(App);
app.use(ElementPlus);
app.mount('#app');

// 暴露到 window
window.Vue3 = app;
window.ElementPlus = ElementPlus;
```

```json
// demo/vue3-host/package.json
{
  "dependencies": {
    "vue": "^3.4.21",
    "vue-i18n": "^9.14.5",
    "element-plus": "^2.7.0"
  }
}
```

> 注意：Vue 3 的全局对象暴露的是 `app` 实例还是 `Vue` 对象，需要与 `widget-wrapper-plugin` 的 `vueGlobal` 配置保持一致。当前插件默认 `vueGlobal = 'Vue'`，建议统一改为 `Vue3`。

### 4.3 扩展 widget-loader 的 SUPPORTED_DEPS

```js
// wc/widget-loader/index.js
const SUPPORTED_DEPS = {
  vue2:      { version: '2.6.14', compatibleRange: '^2.6.0', globalVar: 'Vue2' },
  vue3:      { version: '3.4.21', compatibleRange: '^3.0.0', globalVar: 'Vue3' },
  aui:       { version: '1.8.2',  compatibleRange: '^1.8.0', globalVar: 'aui'  },
  // 新增 ElementUI 公共依赖
  elementUi: { version: '2.15.14', compatibleRange: '^2.15.0', globalVar: 'ElementUI' },
  elementPlus:{ version: '2.7.0', compatibleRange: '^2.0.0', globalVar: 'ElementPlus' }
};
```

在 `checkDependencies` 中增加 ElementUI 校验：

```js
// 校验 element-ui / element-plus
if (vueVersion === '3') {
  const epDep = SUPPORTED_DEPS.elementPlus;
  const epRuntime = typeof window !== 'undefined' ? window[epDep.globalVar] : undefined;
  if (!epRuntime) {
    errors.push(t('loader.dep_element_plus_missing', { name, range: epDep.compatibleRange }));
  } else if (epRuntime.version && !satisfies(epRuntime.version, epDep.compatibleRange)) {
    errors.push(t('loader.dep_element_plus_version', { name, range: epDep.compatibleRange, actual: epRuntime.version }));
  }
} else {
  const elDep = SUPPORTED_DEPS.elementUi;
  const elRuntime = typeof window !== 'undefined' ? window[elDep.globalVar] : undefined;
  if (!elRuntime) {
    errors.push(t('loader.dep_element_ui_missing', { name, range: elDep.compatibleRange }));
  } else if (elRuntime.version && !satisfies(elRuntime.version, elDep.compatibleRange)) {
    errors.push(t('loader.dep_element_ui_version', { name, range: elDep.compatibleRange, actual: elRuntime.version }));
  }
}
```

widget 配置中声明所需 UI 库：

```js
// 基座加载 widget 时的配置示例
{
  name: 'bi-sales-panel',
  js: 'https://cdn.example.com/widgets/bi-sales-panel.js',
  css: 'https://cdn.example.com/widgets/bi-sales-panel.css',
  vueVersion: '2',        // '2' 或 '3'
  uiLib: 'element-ui'     // 可选，仅用于 loader 校验提示
}
```

---

## 5. 构建配置改造

### 5.1 Vue 2 物料（Vue CLI）

```js
// demo/vue2-widget-lib/vue.config.js
const WidgetPlugin = require('../wc/widget-wrapper-plugin/vue-cli-plugin');

module.exports = {
  chainWebpack: WidgetPlugin({
    name: 'bi-sales-panel',
    component: './src/components/SalesPanel.vue',
    vueGlobal: 'Vue2'        // 与 SUPPORTED_DEPS.vue2.globalVar 一致
  }),
  configureWebpack: {
    externals: {
      vue: 'Vue2',
      aui: 'aui',
      'element-ui': 'ElementUI',
      'wc-i18n': '__wcI18n__'
    }
  }
};
```

### 5.2 Vue 3 物料（Vite）

```js
// demo/vue3-widget-lib/vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import widgetVitePlugin from '../wc/widget-wrapper-plugin/vite-plugin.js';

export default defineConfig({
  plugins: [
    vue(),
    widgetVitePlugin({
      name: 'bi-finance-panel',
      component: './src/components/FinancePanel.vue',
      vueGlobal: 'Vue3'      // 与 SUPPORTED_DEPS.vue3.globalVar 一致
    })
  ],
  build: {
    rollupOptions: {
      external: ['vue', 'aui', 'element-plus', 'wc-i18n'],
      output: {
        globals: {
          vue: 'Vue3',
          aui: 'aui',
          'element-plus': 'ElementPlus',
          'wc-i18n': '__wcI18n__'
        }
      }
    }
  }
});
```

### 5.3 直接修改 widget-wrapper-plugin（推荐，避免每个 widget 重复配置）

由于当前 `widget-wrapper-plugin` 已经统一处理 `vue` / `aui` / `wc-i18n` 的 external，可直接在插件内部加入 ElementUI 的 external 配置，使所有 widget 自动生效。

#### Vue CLI 插件修改

```js
// wc/widget-wrapper-plugin/vue-cli-plugin.js
config.externals({
  vue: vueGlobal,
  aui: 'aui',
  'element-ui': 'ElementUI',
  'wc-i18n': '__wcI18n__'
});
```

#### Vite 插件修改

```js
// wc/widget-wrapper-plugin/vite-plugin.js
rollupOptions: {
  external: ['vue', 'aui', 'element-plus', 'wc-i18n'],
  output: {
    globals: {
      vue: vueGlobal,
      aui: 'aui',
      'element-plus': 'ElementPlus',
      'wc-i18n': '__wcI18n__'
    }
  }
}
```

---

## 6. 迁移步骤

### 6.1 迁移顺序

1. **先升级基座**：
   - `vue2-host` 安装 `element-ui` 并全局注册。
   - `vue3-host` 安装 `element-plus` 并全局注册。
2. **升级构建插件**：`widget-wrapper-plugin` 增加 ElementUI external。
3. **升级 `widget-loader`**：扩展 `SUPPORTED_DEPS` 与 `checkDependencies`。
4. **按优先级迁移 widget**：
   - 优先级 1：独立展示型 widget（如看板卡片、统计面板），影响范围小。
   - 优先级 2：表单型 widget（依赖 Input、Select、DatePicker 等），需要重点验证交互。
   - 优先级 3：复杂型 widget（含 Table、Tree、Dialog、Tabs 等），回归成本高，放在最后。
5. **每个 widget 灰度发布**：先迁移 1 个 widget 到预发环境验证，确认无问题后再批量迁移同类 widget。

### 6.2 单个 widget 代码改动清单

#### 6.2.1 移除 aui 依赖

```diff
- import { AuiButton, AuiInput } from 'aui';
+ // 若基座已全局注册，无需显式引入；否则仅引入类型/组件
+ import { ElButton, ElInput } from 'element-ui';

export default {
  components: {
-   AuiButton,
-   AuiInput
+   ElButton,
+   ElInput
  }
};
```

#### 6.2.2 模板标签替换

| aui 标签 | element-ui 标签 |
| --- | --- |
| `<aui-button>` | `<el-button>` |
| `<aui-input>` | `<el-input>` |
| `<aui-select>` | `<el-select>` |
| `<aui-dialog>` | `<el-dialog>` |
| `<aui-table>` | `<el-table>` |
| `<aui-form>` | `<el-form>` |
| `<aui-tabs>` | `<el-tabs>` |
| `<aui-tree>` | `<el-tree>` |

#### 6.2.3 Props 名称调整（常见差异）

| 场景 | aui | element-ui |
| --- | --- | --- |
| 按钮类型 | `type="normal"` | `type="default"` |
| 输入框清空 | `clearable` 可能命名不同 | `clearable` |
| 对话框关闭 | `@close` | `@close` |
| 对话框可见 | `:visible.sync` | `:visible.sync`（Vue 2）/ `v-model`（Vue 3） |
| 表格列宽 | `width` | `width` |
| 表单 label 宽度 | `:label-width` | `:label-width` |

> 具体差异需要对照当前 aui 组件 API 文档与 ElementUI 官方文档逐条核对。

#### 6.2.4 事件名称调整

- 大部分 click / change / input / blur / focus 事件名称一致。
- `aui` 中自定义事件如 `aui-confirm`、`aui-cancel` 需要改为 ElementUI 对应事件，如 `confirm`、`cancel` 或 `close`。
- Vue 3 中 `v-model` 默认 prop 从 `value` 改为 `modelValue`，事件从 `input` 改为 `update:modelValue`，需特别检查。

#### 6.2.5 图标替换

- `element-ui` 使用 `el-icon-*` 类名字体图标。
- `element-plus` 推荐使用独立的 `@element-plus/icons-vue` SVG 图标组件。
- 迁移时需要将 aui 图标统一替换为 ElementUI/ElementPlus 图标，或保留自定义图标字体并在基座加载。

### 6.3 测试 checklist

- [ ] 基座页面能正常加载 element-ui / element-plus 的 CSS，无 404。
- [ ] `widget-loader` 对未迁移的 aui widget 仍然兼容。
- [ ] 迁移后的 widget 在 `vue2-host` / `vue3-host` 中正常渲染，控制台无版本不兼容报错。
- [ ] widget 内所有交互组件（按钮、输入框、下拉框、日期、表格分页、弹窗）功能正常。
- [ ] 主题色、字体、间距与基座设计规范一致。
- [ ] 表单校验规则生效，错误提示样式正确。
- [ ] 多 widget 同时挂载时，无重复加载 element-ui / element-plus 的网络请求。
- [ ] 页面无样式冲突、无图标显示为方框或空白。
- [ ] 降级占位与重试机制在 widget 加载失败时仍然可用。

---

## 7. 回滚方案

### 7.1 回滚触发条件

- 迁移后的 widget 在生产环境出现严重 bug（如核心功能不可用、样式大面积错乱）。
- 基座升级 ElementUI 后导致大量未迁移的 aui widget 异常。
- 性能 regression 超过可接受范围（如首屏加载时间明显增加）。

### 7.2 回滚操作

#### 7.2.1 单个 widget 回滚

1. 将该 widget 的 JS/CSS CDN 地址切回迁移前的 aui 版本。
2. 在 widget 配置中保持 `vueVersion` 不变。
3. 由于基座同时保留了 aui 运行时（迁移初期），未迁移的 aui widget 可继续工作。

```js
// 基座配置示例：同时支持 aui 与 ElementUI 双轨运行
const widget = {
  name: 'bi-sales-panel',
  js: isElementUIReady(widget)
    ? 'https://cdn.example.com/widgets/v2/bi-sales-panel.js'
    : 'https://cdn.example.com/widgets/v1/bi-sales-panel.js',
  css: '...',
  vueVersion: '2'
};
```

#### 7.2.2 基座回滚

1. 将 `vue2-host` / `vue3-host` 回退到未引入 element-ui / element-plus 的版本。
2. 将 `widget-wrapper-plugin` 回退到未 externalize ElementUI 的版本。
3. 将 `widget-loader` 回退到未校验 ElementUI 的版本。
4. 所有已迁移的 widget 必须同步切回 aui 版本，否则会出现 `ElementUI is not defined` 运行时错误。

### 7.3 平滑过渡建议

- **双轨运行期**：基座同时加载 aui 与 ElementUI，widget 按需选择。建议该过渡期不超过 2 个迭代。
- **版本标记**：widget 配置增加 `uiLib: 'aui' | 'element-ui' | 'element-plus'`，便于灰度切换。
- **CDN 版本目录隔离**：迁移产物放到 `v2/` 目录，原产物保留在 `v1/` 目录，避免覆盖。

---

## 8. 风险与注意事项

### 8.1 CSS 冲突

- **风险**：element-ui / element-plus 与 aui 的全局样式（如 normalize、工具类、z-index、box-sizing）可能互相覆盖。
- **对策**：
  - 基座统一加载一套 UI 库 CSS，widget 产物中不再内嵌 CSS。
  - 若必须双轨运行，确保 aui 与 ElementUI 的样式作用域隔离（如通过 BEM 前缀、CSS Modules 或 widget 外层包裹唯一类名）。
  - 避免在基座同时引入两套库的 index.css；优先只加载当前激活 widget 所需 CSS。

### 8.2 图标字体差异

- **风险**：aui 使用自定义字体图标，ElementUI 使用 `element-icons`，ElementPlus 使用 SVG 图标。直接替换图标类名会导致图标显示异常。
- **对策**：
  - 建立 aui 图标到 ElementUI/ElementPlus 图标的映射表，批量替换。
  - 若存在业务自定义图标，保留自定义字体并在基座加载。
  - Vue 3 项目优先使用 `@element-plus/icons-vue` 的 SVG 组件。

### 8.3 element-ui 与 element-plus 的破坏性差异

| 项目 | element-ui（Vue 2） | element-plus（Vue 3） |
| --- | --- | --- |
| 图标 | 字体图标 `el-icon-*` | SVG 组件 `<el-icon><Search /></el-icon>` |
| 全局方法 | `this.$message` | `this.$message`（需 app.use 注入） |
| 弹窗挂载 | 默认挂载到 body | 默认挂载到 body，可通过 `append-to` 调整 |
| 表单校验 | `rules` + `ref.validate` | API 基本一致，但部分规则名有调整 |
| 事件命名 | 小写短横线或 camelCase | 推荐 camelCase |
| v-model | `value` / `input` | `modelValue` / `update:modelValue` |
| Tree 组件 | `node-key` / `default-expanded-keys` | API 基本一致 |

- **对策**：迁移时逐组件对照官方文档，编写映射表；对高频组件（Button、Input、Select、Table、Form、Dialog）优先做兼容性封装。

### 8.4 运行时版本锁定

- **风险**：widget 构建时 `element-ui` 作为 devDependency 的版本与基座运行时不一致，可能导致 prop 类型、事件行为差异。
- **对策**：
  - 所有 widget 与基座使用同一版本的 `element-ui` / `element-plus`。
  - 在 `widget-loader` 中通过 `SUPPORTED_DEPS` 强制版本校验，不兼容版本直接拒绝加载。
  - CI 中添加版本一致性检查脚本，禁止 widget 安装与基座差异大于 patch 的 UI 库版本。

### 8.5 体积与性能

- **风险**：element-plus 完整包体积大于 element-ui，可能增加基座首屏加载时间。
- **对策**：
  - 基座使用 CDN 加载完整包并开启浏览器缓存。
  - 评估是否对基座自身 UI 也做按需加载（仅基座自身使用的组件），但 widget 仍走全局 external。
  - 监控首屏 `LCP` 与 `JS 执行时间`。

### 8.6 国际化与默认语言

- **风险**：ElementUI 默认语言为中文（zh-CN），ElementPlus 默认语言为英文（en）。若基座切换语言，组件内部提示语言不会同步。
- **对策**：
  - 基座统一配置 ElementUI/ElementPlus 的 i18n 与基座 `vue-i18n` 联动。
  - Vue 2：`ElementUI.locale(useLang)`。
  - Vue 3：通过 `app.use(ElementPlus, { locale: zhCn })` 并随基座语言切换动态更新。

---

## 9. 附录：关键文件清单

| 文件路径 | 改动说明 |
| --- | --- |
| `/workspace/wc/widget-loader/index.js` | 扩展 `SUPPORTED_DEPS`，增加 ElementUI/ElementPlus 版本校验 |
| `/workspace/wc/widget-wrapper-plugin/vue-cli-plugin.js` | externalize `element-ui` |
| `/workspace/wc/widget-wrapper-plugin/vite-plugin.js` | externalize `element-plus` |
| `/workspace/demo/vue2-host/package.json` / `src/main.js` | 安装并全局注册 `element-ui` |
| `/workspace/demo/vue3-host/package.json` / `src/main.js` | 安装并全局注册 `element-plus` |
| `/workspace/demo/vue2-widget-lib/vue.config.js` | 增加 `element-ui` external |
| `/workspace/demo/vue3-widget-lib/vite.config.js` | 增加 `element-plus` external |

> 注：本文档为策略设计，不直接修改源码。实际迁移时请按上述清单分步实施，并在每个 widget 迁移完成后执行测试 checklist。

---

## 10. 按需加载补充（生产环境推荐）

> ⚠️ **结论更新**：本文第 2.2 节与第 3 节推荐的「基座提供完整 ElementUI 全量包」方案在生产环境已被**注册表驱动按需加载**方案取代。全量加载仅作为按需加载的**降级兜底**保留，不再作为生产环境首屏加载的首选方案。

### 10.1 为什么不再推荐首屏全量加载

调研数据表明，基座首屏一次性加载完整 ElementUI 的成本偏高：

| 库 | 全量 JS（gzip） | 全量 CSS（未压缩） |
| --- | --- | --- |
| `element-ui@2.15.14` | ~198.6 kB | 240 kB |
| `element-plus@2.7.0` | ~353.5 kB | 320 kB |

而典型 BI 看板卡片往往只用到 5～10 个组件。全量加载会让首屏承担数百 kB 的无效 UI 体积，与项目「最大化页面性能」的首要目标冲突。

### 10.2 新方案：注册表驱动按需加载

新方案通过 `schema.json` 的 `uiDependencies` 字段声明每个物料所需的 UI 组件，由基座在挂载物料前按需并行加载并注册到对应 Vue 运行时，多物料共享同一份组件缓存。典型看板首屏 UI 体积可从 ~350 kB 降至 ~60～100 kB。

- 方案设计与架构图：见 [`elementui-on-demand-loading.md`](./elementui-on-demand-loading.md)
- `uiDependencies` 字段格式、预加载流程、chunk URL 规范、缓存与降级策略、4 方案对比与实施路线图均在上述文档中详述。

### 10.3 与本文档的关系

- 本文第 4 节「基座注入设计」、第 5 节「构建配置改造（externalize）」、第 6 节「迁移步骤」、第 7 节「回滚方案」仍然适用——物料侧 externalize 与基座托管公共依赖的契约不变。
- 区别仅在于：基座不再「首屏全量 `app.use(ElementPlus)`」，而是「按 `uiDependencies` 注册表按需加载 per-component chunk，失败时降级到全量包」。
- 迁移顺序建议：先按本文完成基座 externalize 与物料迁移，再按 [`elementui-on-demand-loading.md`](./elementui-on-demand-loading.md) 第 7.3 节路线图接入按需加载。
