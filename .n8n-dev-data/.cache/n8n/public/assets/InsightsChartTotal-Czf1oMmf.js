import { B as Bar } from "./index-jhcBWw1X.js";
import { d as defineComponent, gh as useCssVar, q as computed, fb as dateformat, i0 as DATE_FORMAT_MASK, c as useI18n, e as createBlock, g as openBlock, m as unref } from "./index-BolKFsR6.js";
import { g as generateBarChartOptions } from "./chartjs.utils-Cm2acgkX.js";
import "./InsightsSummary-BJagTlqW.js";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "InsightsChartTotal",
  props: {
    data: {},
    type: {}
  },
  setup(__props) {
    const props = __props;
    const i18n = useI18n();
    const colorPrimary = useCssVar("--color-primary", document.body);
    const chartOptions = computed(
      () => generateBarChartOptions({
        plugins: {
          tooltip: {
            itemSort: (a) => a.dataset.label === i18n.baseText("insights.banner.title.succeeded") ? -1 : 1
          }
        }
      })
    );
    const chartData = computed(() => {
      const labels = [];
      const succeededData = [];
      const failedData = [];
      for (const entry of props.data) {
        labels.push(dateformat(entry.date, DATE_FORMAT_MASK));
        succeededData.push(entry.values.succeeded);
        failedData.push(entry.values.failed);
      }
      return {
        labels,
        datasets: [
          {
            label: i18n.baseText("insights.banner.title.failed"),
            data: failedData,
            backgroundColor: colorPrimary.value
          },
          {
            label: i18n.baseText("insights.banner.title.succeeded"),
            data: succeededData,
            backgroundColor: "#3E999F"
          }
        ]
      };
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(Bar), {
        data: chartData.value,
        options: chartOptions.value
      }, null, 8, ["data", "options"]);
    };
  }
});
export {
  _sfc_main as default
};
