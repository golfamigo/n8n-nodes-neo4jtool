import { _ as _export_sfc, h as resolveComponent, i as createElementBlock, g as openBlock, j as createVNode, w as withCtx, l as createTextVNode, n as normalizeClass } from "./index-BolKFsR6.js";
const callout = "_callout_tsein_123";
const style0 = {
  callout
};
const _sfc_main = {};
function _sfc_render(_ctx, _cache) {
  const _component_N8nIcon = resolveComponent("N8nIcon");
  const _component_N8nText = resolveComponent("N8nText");
  const _component_N8nLink = resolveComponent("N8nLink");
  const _component_N8nButton = resolveComponent("N8nButton");
  return openBlock(), createElementBlock("div", {
    class: normalizeClass(_ctx.$style.callout)
  }, [
    createVNode(_component_N8nIcon, {
      icon: "lock",
      size: "size"
    }),
    createVNode(_component_N8nText, {
      bold: "",
      tag: "h3",
      size: "large"
    }, {
      default: withCtx(() => _cache[0] || (_cache[0] = [
        createTextVNode("Upgrade to Pro or Enterprise to see full data")
      ])),
      _: 1
    }),
    createVNode(_component_N8nText, null, {
      default: withCtx(() => [
        _cache[2] || (_cache[2] = createTextVNode("Gain access to detailed execution data with one year data retention. ")),
        createVNode(_component_N8nLink, { to: "/" }, {
          default: withCtx(() => _cache[1] || (_cache[1] = [
            createTextVNode("Learn more")
          ])),
          _: 1
        })
      ]),
      _: 1
    }),
    createVNode(_component_N8nButton, {
      type: "primary",
      size: "large"
    }, {
      default: withCtx(() => _cache[3] || (_cache[3] = [
        createTextVNode("Upgrade")
      ])),
      _: 1
    })
  ], 2);
}
const cssModules = {
  "$style": style0
};
const InsightsPaywall = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", _sfc_render], ["__cssModules", cssModules]]);
export {
  InsightsPaywall as default
};
