import { d as defineComponent, gh as useCssVar, q as computed, fb as dateformat, i0 as DATE_FORMAT_MASK, i2 as transformInsightsFailureRate, c as useI18n, e as createBlock, g as openBlock, m as unref, i3 as INSIGHTS_UNIT_MAPPING } from "./index-BolKFsR6.js";
import { g as generateBarChartOptions } from "./chartjs.utils-Cm2acgkX.js";
import { s as smartDecimal } from "./InsightsSummary-BJagTlqW.js";
import { B as Bar } from "./index-jhcBWw1X.js";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "InsightsChartFailureRate",
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
            callbacks: {
              label: (context) => {
                const label = context.dataset.label ?? "";
                return `${label} ${smartDecimal(context.parsed.y)}${INSIGHTS_UNIT_MAPPING[props.type](context.parsed.y)}`;
              }
            }
          }
        }
      })
    );
    const chartData = computed(() => {
      const labels = [];
      const data = [];
      for (const entry of props.data) {
        labels.push(dateformat(entry.date, DATE_FORMAT_MASK));
        data.push(transformInsightsFailureRate(entry.values.failureRate));
      }
      return {
        labels,
        datasets: [
          {
            label: i18n.baseText("insights.banner.title.failureRate"),
            data,
            backgroundColor: colorPrimary.value
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
