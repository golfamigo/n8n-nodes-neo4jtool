const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/InsightsPaywall-CwgVLWer.js","assets/index-BolKFsR6.js","assets/index-CZPKmOs3.css","assets/InsightsPaywall-OeXh6LeZ.css","assets/InsightsChartTotal-Czf1oMmf.js","assets/index-jhcBWw1X.js","assets/chartjs.utils-Cm2acgkX.js","assets/InsightsSummary-BJagTlqW.js","assets/InsightsSummary-W08OzElS.css","assets/InsightsChartFailed-DSmO3hz7.js","assets/InsightsChartFailureRate-ERj7qNeH.js","assets/InsightsChartTimeSaved-CT3zwXsy.js","assets/InsightsChartAverageRuntime-Cxvz6Yw9.js","assets/InsightsTableWorkflows-8EMt_xLI.js","assets/InsightsTableWorkflows-BnEoVZ3U.css"])))=>i.map(i=>d[i]);
import { d as defineComponent, gs as useInsightsStore, q as computed, bZ as defineAsyncComponent, r as ref, I as watch, h as resolveComponent, i as createElementBlock, g as openBlock, j as createVNode, k as createBaseVNode, w as withCtx, l as createTextVNode, t as toDisplayString, m as unref, c as useI18n, e as createBlock, f as createCommentVNode, n as normalizeClass, F as Fragment, b2 as resolveDynamicComponent, aq as __vitePreload, _ as _export_sfc } from "./index-BolKFsR6.js";
import { I as InsightsSummary } from "./InsightsSummary-BJagTlqW.js";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "InsightsDashboard",
  props: {
    insightType: {}
  },
  setup(__props) {
    const InsightsPaywall = defineAsyncComponent(
      async () => await __vitePreload(() => import("./InsightsPaywall-CwgVLWer.js"), true ? __vite__mapDeps([0,1,2,3]) : void 0)
    );
    const InsightsChartTotal = defineAsyncComponent(
      async () => await __vitePreload(() => import("./InsightsChartTotal-Czf1oMmf.js"), true ? __vite__mapDeps([4,5,1,2,6,7,8]) : void 0)
    );
    const InsightsChartFailed = defineAsyncComponent(
      async () => await __vitePreload(() => import("./InsightsChartFailed-DSmO3hz7.js"), true ? __vite__mapDeps([9,5,1,2,6,7,8]) : void 0)
    );
    const InsightsChartFailureRate = defineAsyncComponent(
      async () => await __vitePreload(() => import("./InsightsChartFailureRate-ERj7qNeH.js"), true ? __vite__mapDeps([10,1,2,6,7,8,5]) : void 0)
    );
    const InsightsChartTimeSaved = defineAsyncComponent(
      async () => await __vitePreload(() => import("./InsightsChartTimeSaved-CT3zwXsy.js"), true ? __vite__mapDeps([11,1,2,6,7,8,5]) : void 0)
    );
    const InsightsChartAverageRuntime = defineAsyncComponent(
      async () => await __vitePreload(() => import("./InsightsChartAverageRuntime-Cxvz6Yw9.js"), true ? __vite__mapDeps([12,1,2,6,7,8,5]) : void 0)
    );
    const InsightsTableWorkflows = defineAsyncComponent(
      async () => await __vitePreload(() => import("./InsightsTableWorkflows-8EMt_xLI.js"), true ? __vite__mapDeps([13,1,2,7,8,14]) : void 0)
    );
    const props = __props;
    const i18n = useI18n();
    const insightsStore = useInsightsStore();
    const chartComponents = computed(() => ({
      total: InsightsChartTotal,
      failed: InsightsChartFailed,
      failureRate: InsightsChartFailureRate,
      timeSaved: InsightsChartTimeSaved,
      averageRunTime: InsightsChartAverageRuntime
    }));
    const transformFilter = ({ id, desc }) => {
      const key = id;
      const order = desc ? "desc" : "asc";
      return `${key}:${order}`;
    };
    const fetchPaginatedTableData = ({
      page = 0,
      itemsPerPage = 20,
      sortBy
    }) => {
      const skip = page * itemsPerPage;
      const take = itemsPerPage;
      const sortKey = sortBy.length ? transformFilter(sortBy[0]) : void 0;
      void insightsStore.table.execute(0, {
        skip,
        take,
        sortBy: sortKey
      });
    };
    const sortTableBy = ref([{ id: props.insightType, desc: true }]);
    watch(
      () => props.insightType,
      () => {
        sortTableBy.value = [{ id: props.insightType, desc: true }];
        if (insightsStore.isSummaryEnabled) {
          void insightsStore.summary.execute();
        }
        void insightsStore.charts.execute();
        fetchPaginatedTableData({ sortBy: sortTableBy.value });
      },
      {
        immediate: true
      }
    );
    return (_ctx, _cache) => {
      const _component_N8nHeading = resolveComponent("N8nHeading");
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(_ctx.$style.insightsView)
      }, [
        createVNode(_component_N8nHeading, {
          bold: "",
          tag: "h2",
          size: "xlarge"
        }, {
          default: withCtx(() => [
            createTextVNode(toDisplayString(unref(i18n).baseText("insights.dashboard.title")), 1)
          ]),
          _: 1
        }),
        createBaseVNode("div", null, [
          unref(insightsStore).isSummaryEnabled ? (openBlock(), createBlock(InsightsSummary, {
            key: 0,
            summary: unref(insightsStore).summary.state,
            loading: unref(insightsStore).summary.isLoading,
            class: normalizeClass(_ctx.$style.insightsBanner)
          }, null, 8, ["summary", "loading", "class"])) : createCommentVNode("", true),
          unref(insightsStore).isInsightsEnabled ? (openBlock(), createElementBlock("div", {
            key: 1,
            class: normalizeClass(_ctx.$style.insightsContent)
          }, [
            createBaseVNode("div", {
              class: normalizeClass(_ctx.$style.insightsChartWrapper)
            }, [
              unref(insightsStore).charts.isLoading ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createTextVNode(" loading ")
              ], 64)) : (openBlock(), createBlock(resolveDynamicComponent(chartComponents.value[props.insightType]), {
                key: 1,
                type: props.insightType,
                data: unref(insightsStore).charts.state
              }, null, 8, ["type", "data"]))
            ], 2),
            createBaseVNode("div", {
              class: normalizeClass(_ctx.$style.insightsTableWrapper)
            }, [
              createVNode(unref(InsightsTableWorkflows), {
                "sort-by": sortTableBy.value,
                "onUpdate:sortBy": _cache[0] || (_cache[0] = ($event) => sortTableBy.value = $event),
                data: unref(insightsStore).table.state,
                loading: unref(insightsStore).table.isLoading,
                "onUpdate:options": fetchPaginatedTableData
              }, null, 8, ["sort-by", "data", "loading"])
            ], 2)
          ], 2)) : (openBlock(), createBlock(unref(InsightsPaywall), {
            key: 2,
            "data-test-id": "insights-dashboard-unlicensed"
          }))
        ])
      ], 2);
    };
  }
});
const insightsView = "_insightsView_1upqv_123";
const insightsBanner = "_insightsBanner_1upqv_133";
const insightsContent = "_insightsContent_1upqv_140";
const insightsChartWrapper = "_insightsChartWrapper_1upqv_149";
const insightsTableWrapper = "_insightsTableWrapper_1upqv_154";
const style0 = {
  insightsView,
  insightsBanner,
  insightsContent,
  insightsChartWrapper,
  insightsTableWrapper
};
const cssModules = {
  "$style": style0
};
const InsightsDashboard = /* @__PURE__ */ _export_sfc(_sfc_main, [["__cssModules", cssModules]]);
export {
  InsightsDashboard as default
};
