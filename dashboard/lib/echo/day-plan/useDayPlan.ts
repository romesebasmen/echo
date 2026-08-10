import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyStoredRegenerationProposal,
  DayPlanClientRequestError,
  invalidateStoredRegenerationProposal,
  isStaleDayPlanClientError,
  runExclusiveOperation,
  saveThenGenerate,
  saveThenRequestRegeneration,
} from "./client-flow";
import {
  hasResponseField,
  parseJsonResponse,
} from "@/lib/echo/client/json-response";
import type {
  DayPlan,
  DayPlanRegenerationProposalEnvelope,
  PlanningContext,
  ScheduleBlock,
  SleepQuality,
  Task,
} from "@/lib/echo/types";
import type { ScheduleTaskBlockAction } from "./schedule-block-action";

export interface SaveDayPlanInput {
  energy: number;
  stress: number;
  sleepQuality: SleepQuality;
  hasEaten: boolean;
  checkInNotes: string | null;
  availableFrom: string;
  endOfWorkTime: string;
}

interface DayPlanResponse {
  dayPlan: DayPlan | null;
  planningContext: PlanningContext | null;
  scheduleBlocks: ScheduleBlock[];
  unscheduled: Task[];
}

interface GenerateDayPlanResponse {
  dayPlan: DayPlan;
  planningContext: PlanningContext;
  scheduleBlocks: ScheduleBlock[];
  unscheduled: Task[];
}

interface RegenerateDayPlanResponse {
  proposal: DayPlanRegenerationProposalEnvelope;
  planningContext: PlanningContext;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

export type DayPlanClientErrorKind =
  | "load"
  | "save"
  | "build"
  | "regenerate"
  | "stale-proposal"
  | "apply"
  | "update-block";

export interface DayPlanClientError {
  kind: DayPlanClientErrorKind;
  message: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : GENERIC_ERROR;
}

async function responseBody<T>(response: Response): Promise<T> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is T =>
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      !hasResponseField(body, "error"),
    createError: (message, status) =>
      new DayPlanClientRequestError(message, status),
  });
}

export function useDayPlan() {
  const operationGate = useRef({ busy: false });
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [planningContext, setPlanningContext] = useState<PlanningContext | null>(null);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [unscheduled, setUnscheduled] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isApplyingRegeneration, setIsApplyingRegeneration] = useState(false);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);
  const [regenerationProposal, setRegenerationProposal] =
    useState<DayPlanRegenerationProposalEnvelope | null>(null);
  const [regenerationPlanningContext, setRegenerationPlanningContext] =
    useState<PlanningContext | null>(null);
  const [clientError, setClientError] = useState<DayPlanClientError | null>(null);

  const clearRegenerationProposal = useCallback(() => {
    setRegenerationProposal(null);
    setRegenerationPlanningContext(null);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setClientError(null);
    try {
      const response = await fetch("/api/day-plan");
      const body = await responseBody<DayPlanResponse>(response);
      setDayPlan(body.dayPlan);
      setPlanningContext(body.planningContext);
      setScheduleBlocks(body.scheduleBlocks);
      setUnscheduled(body.unscheduled);
    } catch (loadError) {
      setClientError({ kind: "load", message: errorMessage(loadError) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function saveCheckIn(input: SaveDayPlanInput): Promise<boolean> {
    const outcome = await runExclusiveOperation(operationGate.current, async () => {
      setIsSaving(true);
      setClientError(null);
      clearRegenerationProposal();
      try {
        const body = await saveCheckInRequest(input);
        applySavedCheckIn(body);
        return true;
      } catch (saveError) {
        setClientError({ kind: "save", message: errorMessage(saveError) });
        return false;
      } finally {
        setIsSaving(false);
      }
    });
    return outcome.executed ? outcome.value : false;
  }

  async function saveCheckInRequest(input: SaveDayPlanInput): Promise<DayPlanResponse> {
    const response = await fetch("/api/day-plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return responseBody<DayPlanResponse>(response);
  }

  function applySavedCheckIn(body: DayPlanResponse) {
    setDayPlan(body.dayPlan);
    setPlanningContext(body.planningContext);
    setScheduleBlocks(body.scheduleBlocks);
    setUnscheduled(body.unscheduled);
  }

  async function saveAndGeneratePlan(input: SaveDayPlanInput): Promise<boolean> {
    const outcome = await runExclusiveOperation(operationGate.current, async () => {
      setClientError(null);
      clearRegenerationProposal();
      try {
        await saveThenGenerate(
          input,
          async (currentInput) => {
            setIsSaving(true);
            const saved = await saveCheckInRequest(currentInput);
            applySavedCheckIn(saved);
            setIsSaving(false);
            setIsGenerating(true);
            return saved;
          },
          async () => {
            const response = await fetch("/api/day-plan/generate", { method: "POST" });
            const generated = await responseBody<GenerateDayPlanResponse>(response);
            setDayPlan(generated.dayPlan);
            setPlanningContext(generated.planningContext);
            setScheduleBlocks(generated.scheduleBlocks);
            setUnscheduled(generated.unscheduled);
            return generated;
          },
        );
        return true;
      } catch (operationError) {
        setClientError({ kind: "build", message: errorMessage(operationError) });
        return false;
      } finally {
        setIsSaving(false);
        setIsGenerating(false);
      }
    });
    return outcome.executed ? outcome.value : false;
  }

  function applyGeneratedPlan(generated: GenerateDayPlanResponse): void {
    setDayPlan(generated.dayPlan);
    setPlanningContext(generated.planningContext);
    setScheduleBlocks(generated.scheduleBlocks);
    setUnscheduled(generated.unscheduled);
  }

  async function regenerateWithEcho(input: SaveDayPlanInput): Promise<boolean> {
    const outcome = await runExclusiveOperation(operationGate.current, async () => {
      let errorKind: DayPlanClientErrorKind = "save";
      setClientError(null);
      clearRegenerationProposal();
      try {
        await saveThenRequestRegeneration(
          input,
          async (currentInput) => {
            setIsSaving(true);
            const saved = await saveCheckInRequest(currentInput);
            applySavedCheckIn(saved);
            if (!saved.dayPlan?.checkInCompletedAt) {
              throw new Error("The saved check-in did not include a completion timestamp.");
            }
            return saved.dayPlan.checkInCompletedAt;
          },
          async (expectedCheckInCompletedAt) => {
            setIsSaving(false);
            setIsRegenerating(true);
            errorKind = "regenerate";
            const response = await fetch("/api/day-plan/regenerate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expectedCheckInCompletedAt }),
            });
            return responseBody<RegenerateDayPlanResponse>(response);
          },
          (result) => {
            setRegenerationProposal(result.proposal);
            setRegenerationPlanningContext(result.planningContext);
          },
        );
        return true;
      } catch (operationError) {
        if (isStaleDayPlanClientError(operationError)) {
          clearRegenerationProposal();
          setClientError({
            kind: "stale-proposal",
            message: errorMessage(operationError),
          });
        } else {
          setClientError({ kind: errorKind, message: errorMessage(operationError) });
        }
        return false;
      } finally {
        setIsSaving(false);
        setIsRegenerating(false);
      }
    });
    return outcome.executed ? outcome.value : false;
  }

  async function applyRegeneration(): Promise<boolean> {
    const proposal = regenerationProposal;
    if (!proposal) {
      setClientError({
        kind: "apply",
        message: "There is no Echo recommendation to apply.",
      });
      return false;
    }

    const outcome = await runExclusiveOperation(operationGate.current, async () => {
      setIsApplyingRegeneration(true);
      setClientError(null);
      try {
        await applyStoredRegenerationProposal(
          proposal,
          async (application) => {
            const response = await fetch("/api/day-plan/regenerate/apply", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(application),
            });
            return responseBody<GenerateDayPlanResponse>(response);
          },
          applyGeneratedPlan,
          clearRegenerationProposal,
        );
        return true;
      } catch (applyError) {
        setClientError({
          kind: isStaleDayPlanClientError(applyError) ? "stale-proposal" : "apply",
          message: errorMessage(applyError),
        });
        return false;
      } finally {
        setIsApplyingRegeneration(false);
      }
    });
    return outcome.executed ? outcome.value : false;
  }

  async function updateScheduleTaskBlock(
    blockId: string,
    status: ScheduleTaskBlockAction,
  ): Promise<boolean> {
    const outcome = await runExclusiveOperation(operationGate.current, async () => {
      setIsUpdatingBlock(true);
      setClientError(null);
      try {
        const response = await fetch(`/api/day-plan/blocks/${encodeURIComponent(blockId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const body = await responseBody<DayPlanResponse>(response);
        applySavedCheckIn(body);
        return true;
      } catch (updateError) {
        setClientError({ kind: "update-block", message: errorMessage(updateError) });
        return false;
      } finally {
        setIsUpdatingBlock(false);
      }
    });
    return outcome.executed ? outcome.value : false;
  }

  function dismissRegenerationProposal(): void {
    invalidateStoredRegenerationProposal(clearRegenerationProposal);
  }

  function checkInInputChanged(): void {
    invalidateStoredRegenerationProposal(clearRegenerationProposal);
    if (clientError?.kind === "stale-proposal") setClientError(null);
  }

  const isBusy =
    isSaving ||
    isGenerating ||
    isRegenerating ||
    isApplyingRegeneration ||
    isUpdatingBlock;

  return {
    dayPlan,
    planningContext,
    scheduleBlocks,
    unscheduled,
    isLoading,
    isSaving,
    isGenerating,
    isRegenerating,
    isApplyingRegeneration,
    isUpdatingBlock,
    isBusy,
    regenerationProposal,
    regenerationPlanningContext,
    clientError,
    error: clientError?.message ?? null,
    saveCheckIn,
    saveAndGeneratePlan,
    regenerateWithEcho,
    applyRegeneration,
    updateScheduleTaskBlock,
    dismissRegenerationProposal,
    checkInInputChanged,
  };
}
