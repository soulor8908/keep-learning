/**
 * bi-broken-panel —— 故意崩溃的演示物料（Step 3 错误边界验收用）
 *
 * 不依赖 Vue/aui，仅注册一个 Custom Element：
 *   1. connectedCallback 先渲染一个"即将崩溃"的占位，证明它确实挂载成功；
 *   2. 随后在 setTimeout 里抛出未捕获错误，模拟业务代码运行时崩溃。
 *
 * 期望：widget-loader 的错误边界捕获该运行时错误，把本物料降级为占位，
 *       销售看板等其它物料不受影响，整个看板不白屏。
 */
(function () {
  class BrokenPanel extends HTMLElement {
    connectedCallback() {
      this._auiInit = true;
      const box = document.createElement('div');
      box.style.cssText =
        'padding:16px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;color:#92400e;font-size:13px;';
      box.textContent =
        '崩溃物料 bi-broken-panel：已挂载，500ms 后将抛出运行时错误…';
      this.appendChild(box);

      // 模拟业务代码运行时崩溃（异步，无法被 mountWidget 的 try/catch 接住）
      this._timer = setTimeout(function () {
        throw new Error(
          'bi-broken-panel 业务逻辑崩溃：模拟未捕获的运行时错误（setTimeout 内抛出）'
        );
      }, 500);
    }

    disconnectedCallback() {
      if (this._timer) clearTimeout(this._timer);
    }
  }

  if (!customElements.get('bi-broken-panel')) {
    customElements.define('bi-broken-panel', BrokenPanel);
  }
})();
