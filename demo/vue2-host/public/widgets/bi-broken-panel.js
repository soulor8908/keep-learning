/**
 * bi-broken-panel —— 错误边界 + 重试机制演示物料（Step 3）
 *
 * 行为：
 *   1. 首次挂载：渲染"即将崩溃"占位，500ms 后在 setTimeout 里抛未捕获错误，
 *      模拟业务代码运行时崩溃。错误边界捕获后降级为占位（含"点击重试"）。
 *   2. 点击重试：widget-loader 重新创建元素实例挂载（脚本已加载，loadWidget 短路），
 *      此时 crashCount 已递增，物料正常渲染，体现"重试恢复"而非"重试再失败"。
 *
 * 期望：首次崩溃 → 降级占位 + 重试按钮 → 点击 → 物料恢复正常，旁边销售看板始终不受影响。
 */
(function () {
  let crashCount = 0;

  class BrokenPanel extends HTMLElement {
    connectedCallback() {
      this._init = true;

      if (crashCount === 0) {
        // 首次挂载：模拟运行时崩溃
        const box = document.createElement('div');
        box.style.cssText =
          'padding:16px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;color:#92400e;font-size:13px;';
        box.textContent =
          '崩溃物料 bi-broken-panel：首次挂载，500ms 后将抛出运行时错误。降级后点击"重试"即可恢复。';
        this.appendChild(box);

        this._timer = setTimeout(function () {
          crashCount++;
          throw new Error(
            'bi-broken-panel 首次运行崩溃：模拟未捕获的运行时错误（setTimeout 内抛出），重试后将恢复正常'
          );
        }, 500);
      } else {
        // 重试后：正常渲染，证明重试机制能真正恢复
        const box = document.createElement('div');
        box.style.cssText =
          'padding:16px;border:1px solid #10b981;border-radius:8px;background:#ecfdf5;color:#065f46;font-size:13px;';
        box.textContent =
          '崩溃物料 bi-broken-panel：已通过"点击重试"恢复，运行正常 ✓';
        this.appendChild(box);
      }
    }

    disconnectedCallback() {
      if (this._timer) clearTimeout(this._timer);
    }
  }

  if (!customElements.get('bi-broken-panel')) {
    customElements.define('bi-broken-panel', BrokenPanel);
  }
})();
