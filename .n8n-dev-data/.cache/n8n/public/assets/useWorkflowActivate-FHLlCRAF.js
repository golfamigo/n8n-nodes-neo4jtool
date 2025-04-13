import { r as ref, b as useRouter, a7 as useWorkflowHelpers, U as useWorkflowsStore, L as useUIStore, a as useToast, a5 as useNpsSurveyStore, X as PLACEHOLDER_EMPTY_WORKFLOW_ID, ai as useTelemetry, aR as useExternalHooks, c as useI18n, aL as useStorage, dE as LOCAL_STORAGE_ACTIVATION_FLAG, dF as WORKFLOW_ACTIVE_MODAL_KEY } from "./index-BolKFsR6.js";
function useWorkflowActivate() {
  const updatingWorkflowActivation = ref(false);
  const router = useRouter();
  const workflowHelpers = useWorkflowHelpers({ router });
  const workflowsStore = useWorkflowsStore();
  const uiStore = useUIStore();
  const telemetry = useTelemetry();
  const toast = useToast();
  const i18n = useI18n();
  const npsSurveyStore = useNpsSurveyStore();
  const updateWorkflowActivation = async (workflowId, newActiveState, telemetrySource) => {
    updatingWorkflowActivation.value = true;
    const nodesIssuesExist = workflowsStore.nodesIssuesExist;
    let currWorkflowId = workflowId;
    if (!currWorkflowId || currWorkflowId === PLACEHOLDER_EMPTY_WORKFLOW_ID) {
      const saved = await workflowHelpers.saveCurrentWorkflow();
      if (!saved) {
        updatingWorkflowActivation.value = false;
        return false;
      }
      currWorkflowId = workflowsStore.workflowId;
    }
    const isCurrentWorkflow = currWorkflowId === workflowsStore.workflowId;
    const activeWorkflows = workflowsStore.activeWorkflows;
    const isWorkflowActive = activeWorkflows.includes(currWorkflowId);
    const telemetryPayload = {
      workflow_id: currWorkflowId,
      is_active: newActiveState,
      previous_status: isWorkflowActive,
      ndv_input: telemetrySource === "ndv"
    };
    telemetry.track("User set workflow active status", telemetryPayload);
    void useExternalHooks().run("workflowActivate.updateWorkflowActivation", telemetryPayload);
    try {
      if (isWorkflowActive && newActiveState) {
        toast.showMessage({
          title: i18n.baseText("workflowActivator.workflowIsActive"),
          type: "success"
        });
        updatingWorkflowActivation.value = false;
        return true;
      }
      if (isCurrentWorkflow && nodesIssuesExist && newActiveState) {
        toast.showMessage({
          title: i18n.baseText(
            "workflowActivator.showMessage.activeChangedNodesIssuesExistTrue.title"
          ),
          message: i18n.baseText(
            "workflowActivator.showMessage.activeChangedNodesIssuesExistTrue.message"
          ),
          type: "error"
        });
        updatingWorkflowActivation.value = false;
        return false;
      }
      await workflowHelpers.updateWorkflow(
        { workflowId: currWorkflowId, active: newActiveState },
        !uiStore.stateIsDirty
      );
    } catch (error) {
      const newStateName = newActiveState ? "activated" : "deactivated";
      toast.showError(
        error,
        i18n.baseText("workflowActivator.showError.title", {
          interpolate: { newStateName }
        }) + ":"
      );
      updatingWorkflowActivation.value = false;
      return false;
    }
    const activationEventName = isCurrentWorkflow ? "workflow.activeChangeCurrent" : "workflow.activeChange";
    void useExternalHooks().run(activationEventName, {
      workflowId: currWorkflowId,
      active: newActiveState
    });
    updatingWorkflowActivation.value = false;
    if (isCurrentWorkflow) {
      if (newActiveState && useStorage(LOCAL_STORAGE_ACTIVATION_FLAG).value !== "true") {
        uiStore.openModal(WORKFLOW_ACTIVE_MODAL_KEY);
      } else {
        await npsSurveyStore.fetchPromptsData();
      }
    }
    return newActiveState;
  };
  const activateCurrentWorkflow = async (telemetrySource) => {
    const workflowId = workflowsStore.workflowId;
    return await updateWorkflowActivation(workflowId, true, telemetrySource);
  };
  return {
    activateCurrentWorkflow,
    updateWorkflowActivation,
    updatingWorkflowActivation
  };
}
export {
  useWorkflowActivate as u
};
