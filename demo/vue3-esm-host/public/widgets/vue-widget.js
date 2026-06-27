import { openBlock as s, createElementBlock as l, createElementVNode as i, toDisplayString as r } from "vue";
const a = (t, n) => {
  const o = t.__vccOpts || t;
  for (const [e, c] of n)
    o[e] = c;
  return o;
}, u = { class: "vue-widget" }, d = {
  __name: "Widget",
  props: {
    title: { type: String, default: "Widget" },
    bus: { type: Object, default: null }
  },
  setup(t) {
    const n = t;
    function o() {
      var e;
      (e = n.bus) == null || e.emit("widget:hello", { from: "vue3-esm-widget", time: Date.now() });
    }
    return (e, c) => (s(), l("div", u, [
      i("h3", null, r(t.title), 1),
      i("button", { onClick: o }, "发送事件")
    ]));
  }
}, _ = /* @__PURE__ */ a(d, [["__scopeId", "data-v-b2a176e5"]]);
export {
  _ as default
};
