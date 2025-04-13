import { d as defineComponent, fB as mergeModels, q as computed, r as ref, c as useI18n, i2 as transformInsightsFailureRate, i3 as INSIGHTS_UNIT_MAPPING, i5 as transformInsightsTimeSaved, i6 as transformInsightsAverageRunTime, fC as useModel, h as resolveComponent, i as createElementBlock, g as openBlock, j as createVNode, w as withCtx, l as createTextVNode, e as createBlock, m as unref, aS as N8nTooltip, k as createBaseVNode, t as toDisplayString, F as Fragment, i7 as N8nDataTableServer, _ as _export_sfc } from "./index-BolKFsR6.js";
import { s as smartDecimal } from "./InsightsSummary-BJagTlqW.js";
const _hoisted_1 = { class: "ellipsis" };
const _hoisted_2 = { class: "ellipsis" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "InsightsTableWorkflows",
  props: /* @__PURE__ */ mergeModels({
    data: {},
    loading: { type: Boolean }
  }, {
    "sortBy": {},
    "sortByModifiers": {}
  }),
  emits: /* @__PURE__ */ mergeModels(["update:options"], ["update:sortBy"]),
  setup(__props, { emit: __emit }) {
    const props = __props;
    const i18n = useI18n();
    const rows = computed(() => props.data.data);
    const headers = ref([
      {
        title: "Name",
        key: "workflowName",
        width: 400,
        disableSort: true
      },
      {
        title: i18n.baseText("insights.banner.title.total"),
        key: "total",
        value(row) {
          return row.total.toLocaleString("en-US");
        }
      },
      {
        title: i18n.baseText("insights.banner.title.failed"),
        key: "failed",
        value(row) {
          return row.failed.toLocaleString("en-US");
        }
      },
      {
        title: i18n.baseText("insights.banner.title.failureRate"),
        key: "failureRate",
        value(row) {
          return smartDecimal(transformInsightsFailureRate(row.failureRate)) + INSIGHTS_UNIT_MAPPING.failureRate(row.failureRate);
        }
      },
      {
        title: i18n.baseText("insights.banner.title.timeSaved"),
        key: "timeSaved",
        value(row) {
          return smartDecimal(transformInsightsTimeSaved(row.timeSaved)) + INSIGHTS_UNIT_MAPPING.timeSaved(row.timeSaved);
        }
      },
      {
        title: i18n.baseText("insights.banner.title.averageRunTime"),
        key: "averageRunTime",
        value(row) {
          return smartDecimal(transformInsightsAverageRunTime(row.averageRunTime)) + INSIGHTS_UNIT_MAPPING.averageRunTime(row.averageRunTime);
        }
      },
      {
        title: "Project name",
        key: "projectName",
        disableSort: true
      }
    ]);
    const sortBy = useModel(__props, "sortBy");
    const currentPage = ref(0);
    const itemsPerPage = ref(20);
    const emit = __emit;
    return (_ctx, _cache) => {
      const _component_N8nHeading = resolveComponent("N8nHeading");
      return openBlock(), createElementBlock("div", null, [
        createVNode(_component_N8nHeading, {
          bold: "",
          tag: "h3",
          size: "medium",
          class: "mb-s"
        }, {
          default: withCtx(() => _cache[4] || (_cache[4] = [
            createTextVNode("Workflow insights")
          ])),
          _: 1
        }),
        createVNode(N8nDataTableServer, {
          "sort-by": sortBy.value,
          "onUpdate:sortBy": _cache[0] || (_cache[0] = ($event) => sortBy.value = $event),
          page: currentPage.value,
          "onUpdate:page": _cache[1] || (_cache[1] = ($event) => currentPage.value = $event),
          "items-per-page": itemsPerPage.value,
          "onUpdate:itemsPerPage": _cache[2] || (_cache[2] = ($event) => itemsPerPage.value = $event),
          items: rows.value,
          headers: headers.value,
          "items-length": _ctx.data.count,
          loading: _ctx.loading,
          "onUpdate:options": _cache[3] || (_cache[3] = ($event) => emit("update:options", $event))
        }, {
          [`item.workflowName`]: withCtx(({ item }) => [
            createVNode(unref(N8nTooltip), {
              content: item.workflowName,
              placement: "top"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_1, toDisplayString(item.workflowName), 1)
              ]),
              _: 2
            }, 1032, ["content"])
          ]),
          [`item.projectName`]: withCtx(({ item }) => [
            item.projectName ? (openBlock(), createBlock(unref(N8nTooltip), {
              key: 0,
              content: item.projectName,
              placement: "top"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_2, toDisplayString(item.projectName), 1)
              ]),
              _: 2
            }, 1032, ["content"])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createTextVNode(" - ")
            ], 64))
          ]),
          _: 2
        }, 1032, ["sort-by", "page", "items-per-page", "items", "headers", "items-length", "loading"])
      ]);
    };
  }
});
const InsightsTableWorkflows = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f7a1d7ed"]]);
export {
  InsightsTableWorkflows as default
};
