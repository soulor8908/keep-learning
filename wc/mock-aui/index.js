/**
 * mock-aui —— 统一 UI 组件库（Web Components 实现）
 *
 * 为什么用 Web Components？
 *   Vue2 物料和 Vue3 物料共享同一套 UI 组件时，Vue2 组件和 Vue3 组件互不兼容。
 *   用 Web Components 实现的 aui 组件可以被任何框架使用，真正做到"基座加载一次，所有物料复用"。
 *
 * 基座引入本文件后，组件会自动注册到全局，物料里直接写 <aui-card> 等标签即可。
 * 物料构建时把 'aui' 设为 external，不打包这些组件，只打包业务逻辑。
 *
 * 重要：容器型组件（aui-card / aui-row / aui-footer）不能用 innerHTML，
 *   否则会销毁 Vue 已渲染的子元素。改用 DOM API 保留子元素。
 */

// ─── 统一样式（只注入一次）───
let styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .aui-card {
      padding: 16px;
      background: #fff;
      border: 1px solid #e8e8e8;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .aui-card-title {
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    }
    .aui-statistic {
      flex: 1;
      padding: 12px;
      background: #f3f4f6;
      border-radius: 6px;
    }
    .aui-statistic-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .aui-statistic-value {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }
    .aui-statistic-suffix {
      font-size: 14px;
      font-weight: 400;
      color: #6b7280;
      margin-left: 2px;
    }
    .aui-button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 16px;
      border: 1px solid #3b82f6;
      border-radius: 4px;
      background: #3b82f6;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .aui-button:hover { opacity: 0.9; }
    .aui-button--text {
      background: transparent;
      color: #3b82f6;
      border: none;
    }
    .aui-row {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .aui-progress {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .aui-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #06b6d4);
      transition: width 0.3s ease;
    }
    .aui-list-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: 13px;
    }
    .aui-list-item:last-child { border-bottom: none; }
    .aui-list-label { color: #6b7280; }
    .aui-list-value { color: #111827; font-weight: 500; }
    .aui-footer {
      font-size: 12px;
      color: #6b7280;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 工具函数：把已有子元素移入新容器，不销毁 DOM 节点
 * 解决 innerHTML 会覆盖 Vue 已渲染子元素的问题
 */
function wrapChildren(el, wrapper) {
  while (el.firstChild) {
    wrapper.appendChild(el.firstChild);
  }
  el.appendChild(wrapper);
}

// ─── aui-card：带标题的卡片容器（保留子元素）───
class AuiCard extends HTMLElement {
  connectedCallback() {
    if (this._auiInit) return;
    this._auiInit = true;
    injectStyles();
    const title = this.getAttribute('title') || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'aui-card';
    if (title) {
      const h3 = document.createElement('h3');
      h3.className = 'aui-card-title';
      h3.textContent = title;
      wrapper.appendChild(h3);
    }
    // 把已有子元素（Vue 渲染的）移入 wrapper，不销毁
    wrapChildren(this, wrapper);
  }
}

// ─── aui-statistic：统计数值（叶子组件，无子元素）───
class AuiStatistic extends HTMLElement {
  connectedCallback() {
    if (this._auiInit) return;
    this._auiInit = true;
    injectStyles();
    const label = this.getAttribute('label') || '';
    const value = this.getAttribute('value') || '0';
    const prefix = this.getAttribute('prefix') || '';
    const suffix = this.getAttribute('suffix') || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'aui-statistic';
    wrapper.innerHTML = `
      <div class="aui-statistic-label">${label}</div>
      <div class="aui-statistic-value">${prefix}${value}<span class="aui-statistic-suffix">${suffix}</span></div>
    `;
    this.appendChild(wrapper);
  }
}

// ─── aui-button：按钮 ───
class AuiButton extends HTMLElement {
  connectedCallback() {
    if (this._auiInit) return;
    this._auiInit = true;
    injectStyles();
    const type = this.getAttribute('type') || 'primary';
    const typeClass = type === 'text' ? 'aui-button--text' : '';

    const btn = document.createElement('button');
    btn.className = `aui-button ${typeClass}`;
    // 保留子元素
    wrapChildren(this, btn);
    this.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('aui-click', { bubbles: true }));
    });
  }
}

// ─── aui-row：横向布局行（保留子元素）───
class AuiRow extends HTMLElement {
  connectedCallback() {
    if (this._auiInit) return;
    this._auiInit = true;
    injectStyles();
    const wrapper = document.createElement('div');
    wrapper.className = 'aui-row';
    wrapChildren(this, wrapper);
  }
}

// ─── aui-progress：进度条（叶子组件）───
class AuiProgress extends HTMLElement {
  connectedCallback() {
    if (this._auiInit) return;
    this._auiInit = true;
    injectStyles();
    const percent = Math.min(100, Math.max(0, parseFloat(this.getAttribute('percent') || '0')));
    this.innerHTML = `
      <div class="aui-progress">
        <div class="aui-progress-bar" style="width: ${percent}%"></div>
      </div>
    `;
  }
}

// ─── aui-list-item：列表项（叶子组件）───
class AuiListItem extends HTMLElement {
  connectedCallback() {
    if (this._auiInit) return;
    this._auiInit = true;
    injectStyles();
    const label = this.getAttribute('label') || '';
    const value = this.getAttribute('value') || '';
    this.innerHTML = `
      <div class="aui-list-item">
        <span class="aui-list-label">${label}</span>
        <span class="aui-list-value">${value}</span>
      </div>
    `;
  }
}

// ─── aui-footer：页脚文字（保留子元素）───
class AuiFooter extends HTMLElement {
  connectedCallback() {
    if (this._auiInit) return;
    this._auiInit = true;
    injectStyles();
    const wrapper = document.createElement('div');
    wrapper.className = 'aui-footer';
    wrapChildren(this, wrapper);
  }
}

// ─── 注册所有组件 ───
function register() {
  const components = {
    'aui-card': AuiCard,
    'aui-statistic': AuiStatistic,
    'aui-button': AuiButton,
    'aui-row': AuiRow,
    'aui-progress': AuiProgress,
    'aui-list-item': AuiListItem,
    'aui-footer': AuiFooter
  };

  for (const [name, cls] of Object.entries(components)) {
    if (!customElements.get(name)) {
      customElements.define(name, cls);
    }
  }
}

// 自动注册
register();

// 挂载到全局，供物料判断 aui 是否可用
window.aui = { version: '1.8.2', register };

export { register };
