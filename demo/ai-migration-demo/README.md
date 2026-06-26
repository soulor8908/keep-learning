# AI 一次性迁移演示

> 本目录演示如何通过 **AI 迁移工具**，把两个**老的、未接入 wc 的业务项目**（Vue2 / Vue3）**一次性改造**成看板物料（Custom Element），且**无需为已有 props 的组件额外添加任何属性**。

这是扁平化 props 协议的完整端到端验证：老组件保留原有 `props` 不变，宿主以独立 kebab-case attribute 加载即可。

---

## 一、目录结构

```
ai-migration-demo/
├── README.md                      ← 本文档
├── legacy-vue2-app/               ← 老 Vue2 业务项目（迁移前）
│   ├── package.json
│   ├── vue.config.js
│   ├── public/index.html
│   └── src/
│       ├── main.js                ← 迁移前本地预览入口
│       └── components/
│           ├── SalesDashboard.vue           ← 原始组件（title/metrics/showFooter props）
│           └── SalesDashboard.migrated.vue  ← AI 迁移后产物（props 保留，仅加根类名）
└── legacy-vue3-app/               ← 老 Vue3 业务项目（迁移前）
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js                ← 迁移前本地预览入口
        └── components/
            ├── FinanceOverview.vue           ← 原始组件（panelTitle/summaryData/closable/footnote props）
            └── FinanceOverview.migrated.vue  ← AI 迁移后产物（props 保留，仅加根类名）
```

两个老项目的共同特征：
- **常规 Vue 业务组件**，使用各自框架的标准 `props` 写法。
- **不依赖 wc 框架**，没有 `wc-*` 依赖、没有 Custom Element 包装。
- **可独立 `npm run serve` 预览**，就是普通 Vue 项目。

---

## 二、迁移前：先在本地跑起来（可选）

确认老项目本身是正常的：

```bash
# Vue2 老项目
cd demo/ai-migration-demo/legacy-vue2-app
npm install
npm run serve          # http://localhost:8080，看到销售看板

# Vue3 老项目
cd demo/ai-migration-demo/legacy-vue3-app
npm install
npm run serve          # http://localhost:5173，看到财务概览
```

---

## 三、AI 一次性迁移（核心步骤）

### 方式 A：规则化迁移 CLI（推荐，确定性高）

`wc/migration-skill` 是基于规则的迁移工具，能**一次性**完成组件改造：

```bash
# 从仓库根目录执行

# 1. Vue2 组件 → wc 物料（始终 props 模式，保留原有 props）
node wc/migration-skill/index.js bi-sales-dashboard \
  ./demo/ai-migration-demo/legacy-vue2-app/src/components/SalesDashboard.vue 2

# 2. Vue3 组件 → wc 物料（props 模式）
node wc/migration-skill/index.js bi-finance-overview \
  ./demo/ai-migration-demo/legacy-vue3-app/src/components/FinanceOverview.vue 3
```

产物为同目录下的 `*.migrated.vue`。迁移报告示例：

```
========== 物料迁移报告 ==========
物料名称: bi-sales-dashboard
Vue 版本: 2
通讯模式: props

变更:
  ✅ 保留原有 props，未新增任何属性
  ✅ 给根元素添加 class="bi-sales-dashboard"

警告:
  ⚠️  发现 6 个 CSS 选择器未加命名空间
```

对比迁移前后，**唯一的变化**是根元素加上了 `bi-xxx` 命名空间类名：

```diff
- <div class="sales-dashboard">
+ <div class="sales-dashboard bi-sales-dashboard">
```

`props` 原封不动 —— 这正是扁平化 props 协议带来的收益：**老组件无需新增任何属性**。

### 方式 B：AI 辅助迁移 CLI（语义化建议）

`wc/ai-assistant` 调用 OpenAI 兼容 API，结合 `migrate-component.txt` 提示词给出迁移建议：

```bash
# 需配置 OPENAI_API_KEY / OPENAI_BASE_URL
node wc/ai-assistant/cli.js migrate bi-sales-dashboard \
  ./demo/ai-migration-demo/legacy-vue2-app/src/components/SalesDashboard.vue 2

node wc/ai-assistant/cli.js migrate bi-finance-overview \
  ./demo/ai-migration-demo/legacy-vue3-app/src/components/FinanceOverview.vue 3
```

提示词已内置扁平化 props 协议说明，会建议保留原有 props，宿主以独立 kebab-case attribute 加载。

### 两种方式的关系

| 方式 | 适用 | 产物 |
|---|---|---|
| `migration-skill`（规则化） | 改造规则明确、确定性高，**推荐首选** | 直接生成 `*.migrated.vue` |
| `ai-assistant`（AI 辅助） | 需要语义化建议、复杂场景的人工参考 | 输出迁移建议文本，人工落盘 |

实际项目里可先用 `migration-skill` 一次性产出，再用 `ai-assistant` 复核边界情况。

---

## 四、迁移后：接入 wc 物料打包

把迁移后的组件接入 wc 打包插件，输出 UMD 物料。

### Vue2（vue.config.js）

```js
const widgetPlugin = require('../../../wc/widget-wrapper-plugin/vue-cli-plugin');

module.exports = {
  chainWebpack: widgetPlugin({
    name: 'bi-sales-dashboard',
    component: './src/components/SalesDashboard.migrated.vue',
    vueGlobal: 'Vue2'
  })
};
```

### Vue3（vite.config.js）

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import widgetVitePlugin from '../../../wc/widget-wrapper-plugin/vite-plugin.js';

export default defineConfig({
  plugins: [
    vue(),
    widgetVitePlugin({
      name: 'bi-finance-overview',
      component: './src/components/FinanceOverview.migrated.vue',
      vueGlobal: 'Vue3'
    })
  ]
});
```

执行 `npm run build`，产物在 `dist/bi-sales-dashboard.js` / `dist/bi-finance-overview.js`。

---

## 五、基座以 props 模式加载迁移后物料

基座侧用 `mountWidget` / `renderWidget`，通过 `props` 字段把每个 prop 以 kebab-case 独立 attribute 传入，**无需 config**：

```js
import { mountWidget } from '../../wc/widget-loader';

// Vue2 物料：props 模式加载
await mountWidget(container, {
  name: 'bi-sales-dashboard',
  js: '/widgets/bi-sales-dashboard.js',
  props: {
    title: 'Q3 销售概览',
    metrics: [{ label: '营收', value: 128000 }],
    showFooter: true
  }
});

// Vue3 物料：props 模式加载
await mountWidget(container, {
  name: 'bi-finance-overview',
  js: '/widgets/bi-finance-overview.js',
  props: {
    panelTitle: '2026 Q2 财务概览',
    summaryData: [{ key: 'revenue', label: '营业收入', value: 9821000 }],
    closable: true,
    footnote: '数据更新于 2026-06-25'
  }
});
```

加载器内部会把 `props` 的 camelCase 键转为 kebab-case attribute：
- `title: 'hello'` → `title="hello"`
- `maxCount: 5` → `max-count="5"`
- `isVisible: true` → `is-visible`（presence 语义）
- `showFooter: false` → `show-footer="false"`（显式 false，包装层解析回 false）
- `metrics: [...]` → `metrics='[{...}]'`（JSON 序列化）
- `title: null/undefined` → 不写 attribute（由 Vue 应用 prop 默认值）

包装层 `observedAttributes` 自动包含各 prop 的 kebab-case 名，按声明类型解析后作为独立 prop 注入业务组件。

---

## 六、验证：端到端集成测试

`wc/__tests__/props-integration.test.js` 是本演示的核心验证，覆盖完整链路：

| 用例 | 验证点 |
|---|---|
| 基座以 props 模式加载迁移后物料 | `renderWidget(props)` → wrapper → 业务组件收到独立 props（title/metrics/showFooter），按声明类型解析注入 |

运行：

```bash
npx vitest run wc/__tests__/props-integration.test.js
```

---

## 七、迁移检查清单

迁移完成后人工复核：

- [ ] 根元素是否有 `bi-xxx` 命名空间类名（CLI 已自动添加）
- [ ] CSS 选择器是否都带 `bi-xxx` 前缀（CLI 会扫描并警告未加命名空间的选择器）
- [ ] 组件内是否使用了全局状态（Vuex/Pinia/事件总线）——需改为从 props 读取或组件自治
- [ ] 弹窗/抽屉是否挂载到 `document.body`——检查 z-index 与定位是否影响基座
- [ ] 公共依赖（Vue、ElementUI/ElementPlus）是否 external——由基座统一提供
- [ ] 是否误用了 Shadow DOM / `defineCustomElement`——会隔离全局样式，禁止使用

---

## 八、相关文档

- 完整方案：[`demo/README.md`](../README.md)
- wc 模块文档：[`wc/README.md`](../../wc/README.md)
- 迁移 Skill：[`.trae/skills/wc-migration/SKILL.md`](../../.trae/skills/wc-migration/SKILL.md)
- 扁平化 props 协议实现：`wc/widget-loader/index.js`（`renderWidget` 的 `props` 序列化）、`wc/vue3-widget-template/widget-wrapper.js`（`createWidgetWrapper` + `parseAttrValue`）
