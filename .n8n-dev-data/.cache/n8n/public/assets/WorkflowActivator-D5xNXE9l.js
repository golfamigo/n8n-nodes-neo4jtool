import { d as defineComponent, i as createElementBlock, g as openBlock, l as createTextVNode, k as createBaseVNode, t as toDisplayString, m as unref, c as useI18n, a as useToast, U as useWorkflowsStore, bM as useCredentialsStore, q as computed, dA as getActivatableTriggerNodes, dB as EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE, X as PLACEHOLDER_EMPTY_WORKFLOW_ID, I as watch, h as resolveComponent, cc as resolveDirective, j as createVNode, f as createCommentVNode, n as normalizeClass, e as createBlock, w as withCtx, aC as withDirectives, dC as OPEN_AI_API_CREDENTIAL_TYPE, as as h, _ as _export_sfc } from "./index-BolKFsR6.js";
import { u as useWorkflowActivate } from "./useWorkflowActivate-FHLlCRAF.js";
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "WorkflowActivationErrorMessage",
  props: {
    message: {}
  },
  setup(__props) {
    const i18n = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", null, [
        createTextVNode(toDisplayString(unref(i18n).baseText(
          "workflowActivator.showMessage.displayActivationError.message.errorDataNotUndefined"
        )) + " ", 1),
        _cache[0] || (_cache[0] = createBaseVNode("br", null, null, -1)),
        createBaseVNode("i", null, toDisplayString(_ctx.message), 1)
      ]);
    };
  }
});
const _hoisted_1 = { class: "workflow-activator" };
const _hoisted_2 = {
  key: 0,
  class: "could-not-be-started"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "WorkflowActivator",
  props: {
    workflowActive: { type: Boolean },
    workflowId: {},
    workflowPermissions: {}
  },
  emits: ["update:workflowActive"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { showMessage } = useToast();
    const workflowActivate = useWorkflowActivate();
    const i18n = useI18n();
    const workflowsStore = useWorkflowsStore();
    const credentialsStore = useCredentialsStore();
    const isWorkflowActive = computed(() => {
      const activeWorkflows = workflowsStore.activeWorkflows;
      return activeWorkflows.includes(props.workflowId);
    });
    const couldNotBeStarted = computed(() => {
      return props.workflowActive && isWorkflowActive.value !== props.workflowActive;
    });
    const getActiveColor = computed(() => {
      if (couldNotBeStarted.value) {
        return "#ff4949";
      }
      return "#13ce66";
    });
    const isCurrentWorkflow = computed(() => {
      return workflowsStore.workflowId === props.workflowId;
    });
    const containsTrigger = computed(() => {
      const foundTriggers = getActivatableTriggerNodes(workflowsStore.workflowTriggerNodes);
      return foundTriggers.length > 0;
    });
    const containsOnlyExecuteWorkflowTrigger = computed(() => {
      const foundActiveTriggers = workflowsStore.workflowTriggerNodes.filter(
        (trigger) => !trigger.disabled
      );
      const foundTriggers = foundActiveTriggers.filter(
        (trigger) => trigger.type === EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE
      );
      return foundTriggers.length > 0 && foundTriggers.length === foundActiveTriggers.length;
    });
    const isNewWorkflow = computed(
      () => !props.workflowId || props.workflowId === PLACEHOLDER_EMPTY_WORKFLOW_ID || props.workflowId === "new"
    );
    const disabled = computed(() => {
      if (isNewWorkflow.value || isCurrentWorkflow.value) {
        return !props.workflowActive && !containsTrigger.value;
      }
      return false;
    });
    function findManagedOpenAiCredentialId(usedCredentials) {
      return Object.keys(usedCredentials).find((credentialId) => {
        const credential = credentialsStore.state.credentials[credentialId];
        return credential.isManaged && credential.type === OPEN_AI_API_CREDENTIAL_TYPE;
      });
    }
    function hasActiveNodeUsingCredential(nodes, credentialId) {
      return nodes.some(
        (node) => node?.credentials?.[OPEN_AI_API_CREDENTIAL_TYPE]?.id === credentialId && !node.disabled
      );
    }
    const shouldShowFreeAiCreditsWarning = computed(() => {
      const usedCredentials = workflowsStore?.usedCredentials;
      if (!usedCredentials) return false;
      const managedOpenAiCredentialId = findManagedOpenAiCredentialId(usedCredentials);
      if (!managedOpenAiCredentialId) return false;
      return hasActiveNodeUsingCredential(workflowsStore.allNodes, managedOpenAiCredentialId);
    });
    async function activeChanged(newActiveState) {
      const newState = await workflowActivate.updateWorkflowActivation(
        props.workflowId,
        newActiveState
      );
      emit("update:workflowActive", { id: props.workflowId, active: newState });
    }
    async function displayActivationError() {
      let errorMessage;
      try {
        const errorData = await workflowsStore.getActivationError(props.workflowId);
        if (errorData === void 0) {
          errorMessage = i18n.baseText(
            "workflowActivator.showMessage.displayActivationError.message.errorDataUndefined"
          );
        } else {
          errorMessage = h(_sfc_main$1, {
            message: errorData
          });
        }
      } catch (error) {
        errorMessage = i18n.baseText(
          "workflowActivator.showMessage.displayActivationError.message.catchBlock"
        );
      }
      showMessage({
        title: i18n.baseText("workflowActivator.showMessage.displayActivationError.title"),
        message: errorMessage,
        type: "warning",
        duration: 0
      });
    }
    watch(
      () => props.workflowActive,
      (workflowActive) => {
        if (workflowActive && shouldShowFreeAiCreditsWarning.value) {
          showMessage({
            title: i18n.baseText("freeAi.credits.showWarning.workflow.activation.title"),
            message: i18n.baseText("freeAi.credits.showWarning.workflow.activation.description"),
            type: "warning",
            duration: 0
          });
        }
      }
    );
    return (_ctx, _cache) => {
      const _component_n8n_text = resolveComponent("n8n-text");
      const _component_el_switch = resolveComponent("el-switch");
      const _component_n8n_tooltip = resolveComponent("n8n-tooltip");
      const _component_font_awesome_icon = resolveComponent("font-awesome-icon");
      const _directive_loading = resolveDirective("loading");
      const _directive_n8n_html = resolveDirective("n8n-html");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", {
          class: normalizeClass(_ctx.$style.activeStatusText),
          "data-test-id": "workflow-activator-status"
        }, [
          _ctx.workflowActive ? (openBlock(), createBlock(_component_n8n_text, {
            key: 0,
            color: couldNotBeStarted.value ? "danger" : "success",
            size: "small",
            bold: ""
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(unref(i18n).baseText("workflowActivator.active")), 1)
            ]),
            _: 1
          }, 8, ["color"])) : (openBlock(), createBlock(_component_n8n_text, {
            key: 1,
            color: "text-base",
            size: "small",
            bold: ""
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(unref(i18n).baseText("workflowActivator.inactive")), 1)
            ]),
            _: 1
          }))
        ], 2),
        createVNode(_component_n8n_tooltip, {
          disabled: !disabled.value,
          placement: "bottom"
        }, {
          content: withCtx(() => [
            createBaseVNode("div", null, toDisplayString(unref(i18n).baseText(
              containsOnlyExecuteWorkflowTrigger.value ? "workflowActivator.thisWorkflowHasOnlyOneExecuteWorkflowTriggerNode" : "workflowActivator.thisWorkflowHasNoTriggerNodes"
            )), 1)
          ]),
          default: withCtx(() => [
            withDirectives(createVNode(_component_el_switch, {
              "model-value": _ctx.workflowActive,
              title: _ctx.workflowActive ? unref(i18n).baseText("workflowActivator.deactivateWorkflow") : unref(i18n).baseText("workflowActivator.activateWorkflow"),
              disabled: disabled.value || unref(workflowActivate).updatingWorkflowActivation.value || !isNewWorkflow.value && !_ctx.workflowPermissions.update,
              "active-color": getActiveColor.value,
              "inactive-color": "#8899AA",
              "data-test-id": "workflow-activate-switch",
              "onUpdate:modelValue": activeChanged
            }, null, 8, ["model-value", "title", "disabled", "active-color"]), [
              [_directive_loading, unref(workflowActivate).updatingWorkflowActivation.value]
            ])
          ]),
          _: 1
        }, 8, ["disabled"]),
        couldNotBeStarted.value ? (openBlock(), createElementBlock("div", _hoisted_2, [
          createVNode(_component_n8n_tooltip, { placement: "top" }, {
            content: withCtx(() => [
              withDirectives(createBaseVNode("div", { onClick: displayActivationError }, null, 512), [
                [_directive_n8n_html, unref(i18n).baseText("workflowActivator.theWorkflowIsSetToBeActiveBut")]
              ])
            ]),
            default: withCtx(() => [
              createVNode(_component_font_awesome_icon, {
                icon: "exclamation-triangle",
                onClick: displayActivationError
              })
            ]),
            _: 1
          })
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const activeStatusText = "_activeStatusText_13o3x_123";
const style0 = {
  activeStatusText
};
const cssModules = {
  "$style": style0
};
const WorkflowActivator = /* @__PURE__ */ _export_sfc(_sfc_main, [["__cssModules", cssModules], ["__scopeId", "data-v-d7f3e49d"]]);
export {
  WorkflowActivator as W
};
