// @vitest-environment node
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

    it('observedAttributes 声明 config，attributeChangedCallback 解析 config', () => {
      expect(code).toContain("static get observedAttributes()");
      expect(code).toContain("return ['config']");
      expect(code).toContain('attributeChangedCallback');
      expect(code).toContain('parseConfig(newValue)');
    });

    it('包含 connectedCallback / disconnectedCallback 生命周期', () => {
      expect(code).toContain('connectedCallback()');
      expect(code).toContain('disconnectedCallback()');
      // disconnected 应销毁 vm 并清理 scope
      expect(code).toContain('this.vm.$destroy()');
      expect(code).toContain('this._scope = null');
    });

    it('parseConfig 容错：try/catch 返回 {}', () => {
      expect(code).toContain('function parseConfig(value)');
      expect(code).toContain('try { return value ? JSON.parse(value) : {}; }');
      expect(code).toContain('catch { return {}; }');
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

    it('使用 ref 承载 config 实现响应式更新，避免 unmount/remount', () => {
      expect(code).toContain('this._configRef = ref(');
      expect(code).toContain('this._configRef.value =');
      expect(code).toContain('_updateConfig');
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

    it('attributeChangedCallback 在 config 变化时调用 _updateConfig', () => {
      expect(code).toContain("if (name === 'config'");
      expect(code).toContain('this._updateConfig(newValue)');
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

    it('生命周期含 onMount/onUnmount/onConfigChange 钩子调用', () => {
      expect(code).toContain('connectedCallback()');
      expect(code).toContain('typeof onMount === \'function\'');
      expect(code).toContain('disconnectedCallback()');
      expect(code).toContain('typeof onUnmount === \'function\'');
      expect(code).toContain('attributeChangedCallback');
      expect(code).toContain('typeof onConfigChange === \'function\'');
    });

    it('_render 把 render() 返回的字符串写入 innerHTML', () => {
      expect(code).toContain('_render()');
      expect(code).toContain('const html = render(this._config, this._scope)');
      expect(code).toContain('this.innerHTML = html');
    });

    it('提供 getConfig / getScope 访问器', () => {
      expect(code).toContain('getConfig()');
      expect(code).toContain('getScope()');
    });
  });
});
