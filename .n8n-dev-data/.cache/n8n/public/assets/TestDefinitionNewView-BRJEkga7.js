import { u as useTestDefinitionForm } from "./useTestDefinitionForm-B_2_c7H0.js";
import { d as defineComponent, g7 as useTestDefinitionStore, fS as useAnnotationTagsStore, av as useExecutionsStore, a as useToast, b as useRouter, W as useRoute, ai as useTelemetry, a1 as useRootStore, V as VIEWS, e as createBlock, g as openBlock, m as unref, g8 as N8nLoading } from "./index-BolKFsR6.js";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TestDefinitionNewView",
  props: {
    name: {}
  },
  setup(__props) {
    const props = __props;
    const { state, createTest, updateTest } = useTestDefinitionForm();
    const testDefinitionStore = useTestDefinitionStore();
    const tagsStore = useAnnotationTagsStore();
    const executionsStore = useExecutionsStore();
    const toast = useToast();
    const telemetry = useTelemetry();
    const router = useRouter();
    const route = useRoute();
    function generateTagFromName(name) {
      let tag = name.toLowerCase().replace(/\s+/g, "_");
      if (tag.length > 18) {
        const start = tag.slice(0, 10);
        const end = tag.slice(-8);
        tag = `${start}..${end}`;
      }
      return tag;
    }
    async function createTag(tagName) {
      try {
        const newTag = await tagsStore.create(tagName, { incrementExisting: true });
        return newTag;
      } catch (error) {
        toast.showError(error, "Error", error.message);
        throw error;
      }
    }
    void createTest(props.name).then(async (test) => {
      if (!test) {
        throw new Error("no test found");
      }
      const tag = generateTagFromName(test.name);
      const testTag = await createTag(tag);
      state.value.tags.value = [testTag.id];
      if (typeof route.query?.executionId === "string" && Array.isArray(route.query.annotationTags)) {
        const newTags = [...route.query.annotationTags, testTag.id];
        await executionsStore.annotateExecution(route.query.executionId, { tags: newTags });
      }
      await updateTest(test.id);
      testDefinitionStore.updateRunFieldIssues(test.id);
      telemetry.track(
        "User created test",
        {
          test_id: test.id,
          workflow_id: props.name,
          session_id: useRootStore().pushRef
        },
        {
          withPostHog: true
        }
      );
      await router.replace({
        name: VIEWS.TEST_DEFINITION_EDIT,
        params: { testId: test.id }
      });
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(N8nLoading), {
        loading: "",
        rows: 3
      });
    };
  }
});
export {
  _sfc_main as default
};
