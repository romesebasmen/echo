import { useCallback, useEffect, useRef, useState } from "react";
import { runExclusiveOperation, saveThenGenerate } from "./client-flow";
import type {
  DayPlan,
  PlanningContext,
  ScheduleBlock,
  SleepQuality,
  Task,
} from "@/lib/echo/types";

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
}

interface GenerateDayPlanResponse {
  dayPlan: DayPlan;
  planningContext: PlanningContext;
  scheduleBlocks: ScheduleBlock[];
  unscheduled: Task[];
}

interface ErrorResponse {
  error: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function responseBody<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ErrorResponse;
  const hasError = typeof body === "object" && body !== null && "error" in body;
  if (!response.ok || hasError) {
    throw new Error(hasError ? (body as ErrorResponse).error : GENERIC_ERROR);
  }
  return body as T;
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/day-plan");
      const body = await responseBody<DayPlanResponse>(response);
      setDayPlan(body.dayPlan);
      setPlanningContext(body.planningContext);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : GENERIC_ERROR);
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
      setError(null);
      try {
        const body = await saveCheckInRequest(input);
        applySavedCheckIn(body);
        return true;
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : GENERIC_ERROR);
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
    if (body.dayPlan?.status !== "generated") {
      setScheduleBlocks([]);
      setUnscheduled([]);
    }
  }

  async function saveAndGeneratePlan(input: SaveDayPlanInput): Promise<boolean> {
    const outcome = await runExclusiveOperation(operationGate.current, async () => {
      setError(null);
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
        setError(operationError instanceof Error ? operationError.message : GENERIC_ERROR);
        return false;
      } finally {
        setIsSaving(false);
        setIsGenerating(false);
      }
    });
    return outcome.executed ? outcome.value : false;
  }

  return {
    dayPlan,
    planningContext,
    scheduleBlocks,
    unscheduled,
    isLoading,
    isSaving,
    isGenerating,
    error,
    saveCheckIn,
    saveAndGeneratePlan,
  };
}
