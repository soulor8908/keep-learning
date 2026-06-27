function d(e) {
  return {
    mount(t, n) {
      e(t, n);
    }
  };
}
const o = d((e, t) => {
  e.innerHTML = `
    <div class="h5-widget" style="padding:16px;background:#f0f9eb;border-radius:8px;">
      <h3 style="margin:0 0 8px;color:#67c23a;">${t.title || "H5 Widget"}</h3>
      <button class="h5-btn" style="padding:6px 12px;border:none;background:#67c23a;color:#fff;border-radius:4px;cursor:pointer;">
        H5 发送事件
      </button>
    </div>
  `;
  const n = e.querySelector(".h5-btn");
  n && n.addEventListener("click", () => {
    var r;
    (r = t.bus) == null || r.emit("widget:hello", { from: "vue3-esm-h5", time: Date.now() });
  });
});
export {
  o as default
};
