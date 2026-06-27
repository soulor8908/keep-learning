// @vitest-environment node
// 扁平化 props 协议测试：生成的 wrapper 代码观察声明的 kebab-case prop attribute，
// 用 _collectProps / parseAttrValue 收集为 widgetProps（vue2）或 _propsRef（vue3），
// H5 用 onPropsChange / getProps / render(props, scope)。不再有 parseConfig /
// ['config'] / _configRef / _updateConfig / onConfigChange / getConfig。
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import widgetVueCliPlugin from '../vue-cli-plugin.js';
import { generateVue3Wrapper } from '../vite-plugin.js';
import { generateH5Wrapper } from '../h5-vite-plugin.js';

const { generateVue2Wrapper } = widgetVueCliPlugin;

describe('widget-wrapper wrapper 文件结构生成', () => {
  describe('T1.4a Vue2 wrapper (generateVue2Wrapper)', () => {
    const code = generateVue2Wrapper('bi-sales-panel', 'Vue');

    it('定义 customElement，标签名为物料名', () => {
      expect(code).toContain("customElements.define('bi-sales-panel'");
      expect(code).toContain('class WidgetElement extends HTMLElement');
    });

    it('导入 Vue2 与组件占位别名 __WIDGET_COMPONENT__', () => {
      expect(code).toContain("import Vue from 'vue'");
      expect(code).toContain("import Component from '__WIDGET_COMPONENT__'");
    });

    it('注入 widgetScope：createWidgetScope({ name }) 含物料名', () => {
      expect(code).toContain("createWidgetScope({ name: 'bi-sales-panel' })");
      expect(code).toContain('this._scope =');
      expect(code).toContain('this._widgetScope = this._scope');
    });

    it('observedAttributes 由声明 props 派生（camelToKebab），不再硬编码 config', () => {
      expect(code).toContain("static get observedAttributes()");
      // 扁平化 props 协议：观察的属性来自 getDeclaredPropNames + camelToKebab
      expect(code).toContain('getDeclaredPropNames(Component)');
      expect(code).toContain('camelToKebab');
      expect(code).toContain("n !== 'scope'");
      // 不再硬编码 ['config']
      expect(code).not.toContain("return ['config']");
      expect(code).not.toContain('parseConfig');
    });

    it('attributeChangedCallback 用 parseAttrValue 按 prop 类型解析（非 parseConfig）', () => {
      expect(code).toContain('attributeChangedCallback');
      expect(code).toContain('parseAttrValue');
      // 扁平化 props 协议：整体替换 widgetProps 触发重渲染
      expect(code).toContain('this.vm.widgetProps');
      expect(code).not.toContain('parseConfig');
    });

    it('包含 connectedCallback / disconnectedCallback 生命周期', () => {
      expect(code).toContain('connectedCallback()');
      expect(code).toContain('disconnectedCallback()');
      // disconnected 应销毁 vm 并清理 scope
      expect(code).toContain('this.vm.$destroy()');
      expect(code).toContain('this._scope = null');
    });

    it('parseAttrValue 容错：Boolean 语义 + JSON.parse 回退原始字符串', () => {
      expect(code).toContain('function parseAttrValue(raw, type)');
      expect(code).toContain('if (type === Boolean)');
      expect(code).toContain("raw === ''");
      expect(code).toContain("raw === 'false'");
      expect(code).toContain('try { return JSON.parse(raw); } catch (_) { return raw; }');
      // 不再有 parseConfig 函数
      expect(code).not.toContain('function parseConfig');
    });

    it('vueGlobal 参数注入到 wrapper（不影响默认 Vue 全局名）', () => {
      const code2 = generateVue2Wrapper('bi-x', 'Vue2');
      // wrapper 内不直接引用 vueGlobal（external 已处理全局名），但函数签名接受
      expect(code2).toContain("customElements.define('bi-x'");
    });
  });

  describe('T1.4b Vue3 wrapper (generateVue3Wrapper)', () => {
    const code = generateVue3Wrapper('bi-finance-panel', 'Vue');

    it('定义 customElement，导入 createApp/h/ref', () => {
      expect(code).toContain("customElements.define('bi-finance-panel'");
      expect(code).toContain("import { createApp, h, ref } from 'vue'");
      expect(code).toContain('class WidgetElement extends HTMLElement');
    });

    it('使用 ref 承载 props 实现响应式更新（_propsRef，非 _configRef）', () => {
      // 扁平化 props 协议：_propsRef 而非 _configRef
      expect(code).toContain('this._propsRef = ref(');
      expect(code).toContain('this._propsRef.value =');
      expect(code).toContain('_updateProp');
      // 不再含 config 相关
      expect(code).not.toContain('_configRef');
      expect(code).not.toContain('_updateConfig');
    });

    it('shadowRoot 防御性守卫：检测到 shadowRoot 时 console.error 告警', () => {
      expect(code).toContain('if (this.shadowRoot)');
      expect(code).toContain('console.error');
      // 告警信息含物料名（构建期注入）
      expect(code).toContain('bi-finance-panel');
    });

    it('生命周期：connectedCallback 触发 _mount，disconnectedCallback 调 unmount', () => {
      expect(code).toContain('connectedCallback()');
      expect(code).toContain('this._mount()');
      expect(code).toContain('disconnectedCallback()');
      expect(code).toContain('this.app.unmount()');
    });

    it('attributeChangedCallback 在声明 prop 变化时调用 _updateProp（非 config）', () => {
      // 扁平化 props 协议：反查 prop 名后调用 _updateProp(propName, newValue)
      expect(code).toContain('camelToKebab(n) === name');
      expect(code).toContain('this._updateProp(propName, newValue)');
      // 不再硬编码 name === 'config'
      expect(code).not.toContain("name === 'config'");
      expect(code).not.toContain('_updateConfig');
    });

    it('scope 仅在组件声明时注入（防 fallthrough 到根元素，非无条件注入）', () => {
      expect(code).toContain('hasScopeProp');
      expect(code).toContain("getDeclaredPropNames(Component).includes('scope')");
      expect(code).toContain('if (hasScopeProp) props.scope = this._scope');
      expect(code).not.toMatch(/scope:\s*this\._scope/);
    });
  });

  describe('T1.4c H5 wrapper (generateH5Wrapper)', () => {
    const code = generateH5Wrapper('bi-weather-card');

    it('定义 customElement（带重复注册守卫 customElements.get）', () => {
      expect(code).toContain("if (!customElements.get('bi-weather-card'))");
      expect(code).toContain("customElements.define('bi-weather-card'");
      expect(code).toContain('class H5WidgetElement extends HTMLElement');
    });

    it('导入 widgetEntry from __WIDGET_ENTRY__，解析函数/对象入口', () => {
      expect(code).toContain("import widgetEntry from '__WIDGET_ENTRY__'");
      expect(code).toContain('typeof widgetEntry === \'function\'');
      expect(code).toContain('{ render: widgetEntry }');
    });

    it('render 缺失时抛错：必须 default 导出 render 函数或配置对象', () => {
      expect(code).toContain("typeof render !== 'function'");
      expect(code).toContain('throw new Error');
      expect(code).toContain('物料入口必须 default 导出 render 函数');
    });

    it('内建最小 scope 兜底：createWidgetScope 失败时回退 createMinimalScope', () => {
      expect(code).toContain('try {');
      expect(code).toContain("this._scope = createWidgetScope({ name: 'bi-weather-card' })");
      expect(code).toContain("} catch (e) {");
      expect(code).toContain("this._scope = createMinimalScope('bi-weather-card')");
    });

    it('生命周期含 onMount/onUnmount/onPropsChange 钩子调用（非 onConfigChange）', () => {
      expect(code).toContain('connectedCallback()');
      expect(code).toContain('typeof onMount === \'function\'');
      expect(code).toContain('disconnectedCallback()');
      expect(code).toContain('typeof onUnmount === \'function\'');
      expect(code).toContain('attributeChangedCallback');
      // 扁平化 props 协议：onPropsChange 而非 onConfigChange
      expect(code).toContain('typeof onPropsChange === \'function\'');
      expect(code).not.toContain('onConfigChange');
    });

    it('_render 把 render(props, scope) 返回的字符串写入 innerHTML', () => {
      expect(code).toContain('_render()');
      // 扁平化 props 协议：render(this._props, this._scope) 而非 render(this._config, ...)
      expect(code).toContain('const html = render(this._props, this._scope)');
      expect(code).toContain('this.innerHTML = html');
      expect(code).not.toContain('this._config');
    });

    it('提供 getProps / getScope 访问器（非 getConfig）', () => {
      // 扁平化 props 协议：getProps 而非 getConfig
      expect(code).toContain('getProps()');
      expect(code).toContain('getScope()');
      expect(code).not.toContain('getConfig');
    });
  });
});
