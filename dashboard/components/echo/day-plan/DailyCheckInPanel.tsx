"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useDayPlan } from "@/lib/echo/day-plan/useDayPlan";
import { isCheckInComplete } from "@/lib/echo/day-plan/check-in";
import type {
  CreateCommitmentInput,
  SaveDayPlanInput,
} from "@/lib/echo/day-plan/useDayPlan";
import {
  dayPlanRegenerationErrorMessage,
  groupDayPlanRegenerationProposal,
} from "@/lib/echo/day-plan/regeneration-presentation";
import {
  presentScheduleBlock,
  scheduleStepTiming,
} from "@/lib/echo/day-plan/schedule-presentation";
import { selectNextStep } from "@/lib/echo/day-plan/scheduler";
import {
  fromUserDateTimeLocalString,
  formatUserTime,
  toUserDateString,
  toUserDateTimeLocalString,
} from "@/lib/echo/timezone";
import type {
  Commitment,
  DayPlan,
  DayPlanRegenerationProposalEnvelope,
  PlanningContext,
  ResponsibilityArea,
  ScheduleBlock,
  SleepQuality,
  Task,
} from "@/lib/echo/types";
import {
  RESPONSIBILITY_AREAS,
  RESPONSIBILITY_AREA_LABELS,
} from "@/lib/echo/types";

function defaultAvailability() {
  const now = new Date();
  const availableFrom = toUserDateTimeLocalString(now);
  const planDate = toUserDateString(now);
  const preferredEnd = `${planDate}T20:00`;

  return {
    availableFrom,
    endOfWorkTime: preferredEnd > availableFrom ? preferredEnd : `${planDate}T23:59`,
  };
}

function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

interface CheckInFormProps {
  initialDayPlan: DayPlan | null;
  planningContext: PlanningContext | null;
  isBusy: boolean;
  isSaving: boolean;
  isGenerating: boolean;
  isRegenerating: boolean;
  onSave: ReturnType<typeof useDayPlan>["saveCheckIn"];
  onGenerate: ReturnType<typeof useDayPlan>["saveAndGeneratePlan"];
  onRegenerate: ReturnType<typeof useDayPlan>["regenerateWithEcho"];
  onCheckInChange: ReturnType<typeof useDayPlan>["checkInInputChanged"];
}

function CheckInForm({
  initialDayPlan,
  planningContext,
  isBusy,
  isSaving,
  isGenerating,
  isRegenerating,
  onSave,
  onGenerate,
  onRegenerate,
  onCheckInChange,
}: CheckInFormProps) {
  const defaults = defaultAvailability();
  const [energy, setEnergy] = useState(initialDayPlan?.energy ?? 6);
  const [stress, setStress] = useState(initialDayPlan?.stress ?? 5);
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>(
    initialDayPlan?.sleepQuality ?? "okay",
  );
  const [hasEaten, setHasEaten] = useState<boolean | null>(initialDayPlan?.hasEaten ?? null);
  const [checkInNotes, setCheckInNotes] = useState(initialDayPlan?.checkInNotes ?? "");
  const [availableFrom, setAvailableFrom] = useState(
    initialDayPlan
      ? toUserDateTimeLocalString(new Date(initialDayPlan.availableFrom))
      : defaults.availableFrom,
  );
  const [endOfWorkTime, setEndOfWorkTime] = useState(
    initialDayPlan
      ? toUserDateTimeLocalString(new Date(initialDayPlan.endOfWorkTime))
      : defaults.endOfWorkTime,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function currentInput(): SaveDayPlanInput | null {
    if (hasEaten === null) {
      setLocalError("Choose whether you have eaten so Echo can plan conservatively.");
      return null;
    }

    const availableDate = fromUserDateTimeLocalString(availableFrom);
    const endDate = fromUserDateTimeLocalString(endOfWorkTime);
    if (!availableDate || !endDate) {
      setLocalError("Enter valid times in the America/Chicago timezone.");
      return null;
    }
    if (availableDate >= endDate) {
      setLocalError("Available from must be earlier than the end of your workday.");
      return null;
    }

    setLocalError(null);
    return {
      energy,
      stress,
      sleepQuality,
      hasEaten,
      checkInNotes: checkInNotes.trim() || null,
      availableFrom: availableDate.toISOString(),
      endOfWorkTime: endDate.toISOString(),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = currentInput();
    if (input) await onSave(input);
  }

  async function handleGenerate() {
    const input = currentInput();
    if (input) await onGenerate(input);
  }

  async function handleRegenerate() {
    const input = currentInput();
    if (input) await onRegenerate(input);
  }

  const rangeClassName = "h-1.5 w-full cursor-pointer accent-[var(--accent)]";
  const inputClassName =
    "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7">
      <div className="grid gap-7 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted">
          <span className="flex items-center justify-between">
            How is your energy?
            <span className="font-medium text-foreground">{energy}/10</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={energy}
            onChange={(event) => {
              onCheckInChange();
              setEnergy(Number(event.target.value));
            }}
            className={rangeClassName}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-muted">
          <span className="flex items-center justify-between">
            How stressed are you?
            <span className="font-medium text-foreground">{stress}/10</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={stress}
            onChange={(event) => {
              onCheckInChange();
              setStress(Number(event.target.value));
            }}
            className={rangeClassName}
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted">
          How did you sleep?
          <select
            value={sleepQuality}
            onChange={(event) => {
              onCheckInChange();
              setSleepQuality(event.target.value as SleepQuality);
            }}
            className={inputClassName}
          >
            <option value="poor">Poorly</option>
            <option value="okay">Okay</option>
            <option value="good">Well</option>
          </select>
        </label>

        <fieldset className="flex flex-col gap-2 text-sm text-muted">
          <legend>Have you eaten?</legend>
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={hasEaten === value}
                onClick={() => {
                  if (hasEaten !== value) onCheckInChange();
                  setHasEaten(value);
                }}
                className={`rounded-md border px-3 py-2 transition-colors ${
                  hasEaten === value
                    ? "border-accent text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {value ? "Yes" : "Not yet"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="flex flex-col gap-2 text-sm text-muted">
        Anything affecting today?
        <textarea
          value={checkInNotes}
          maxLength={1000}
          rows={3}
          onChange={(event) => {
            onCheckInChange();
            setCheckInNotes(event.target.value);
          }}
          placeholder="Optional — travel, a rough morning, something on your mind…"
          className={`${inputClassName} resize-y`}
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted">
          Available from
          <input
            type="datetime-local"
            value={availableFrom}
            onChange={(event) => {
              onCheckInChange();
              setAvailableFrom(event.target.value);
            }}
            className={inputClassName}
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          End of workday
          <input
            type="datetime-local"
            value={endOfWorkTime}
            onChange={(event) => {
              onCheckInChange();
              setEndOfWorkTime(event.target.value);
            }}
            className={inputClassName}
            required
          />
        </label>
      </div>

      {localError && <p className="text-sm text-accent">{localError}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-md border border-foreground px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save check-in"}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleGenerate}
          className="text-sm font-medium text-accent transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "Building your plan…" : "Build today’s plan →"}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleRegenerate}
          className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRegenerating ? "Echo is thinking…" : "Regenerate with Echo"}
        </button>
      </div>

      {isRegenerating && (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Echo is considering today’s capacity, tasks, and commitments…
        </p>
      )}

      {planningContext && (
        <p className="text-sm leading-6 text-muted">
          Echo is planning for <span className="text-foreground">{planningContext.capacityTier}</span>{" "}
          capacity: up to {minutesLabel(planningContext.maxScheduledTaskMinutes)} of task work,
          with a break after {planningContext.breakAfterMinutes} minutes.
        </p>
      )}

    </form>
  );
}

interface CommitmentsEditorProps {
  dayPlan: DayPlan | null;
  commitments: Commitment[];
  isBusy: boolean;
  isUpdating: boolean;
  onCreate: ReturnType<typeof useDayPlan>["createCommitment"];
  onDelete: ReturnType<typeof useDayPlan>["deleteCommitment"];
}

function defaultCommitmentTimes(dayPlan: DayPlan): {
  startTime: string;
  endTime: string;
} {
  const start = new Date(dayPlan.availableFrom);
  const planEnd = new Date(dayPlan.endOfWorkTime);
  const preferredEnd = new Date(start.getTime() + 60 * 60 * 1000);
  const end = preferredEnd < planEnd ? preferredEnd : planEnd;
  return {
    startTime: toUserDateTimeLocalString(start),
    endTime: toUserDateTimeLocalString(end),
  };
}

function CommitmentsEditor({
  dayPlan,
  commitments,
  isBusy,
  isUpdating,
  onCreate,
  onDelete,
}: CommitmentsEditorProps) {
  const defaults = dayPlan ? defaultCommitmentTimes(dayPlan) : null;
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(defaults?.startTime ?? "");
  const [endTime, setEndTime] = useState(defaults?.endTime ?? "");
  const [responsibilityArea, setResponsibilityArea] = useState<
    ResponsibilityArea | ""
  >("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!dayPlan || !isCheckInComplete(dayPlan)) {
    return (
      <section aria-labelledby="commitments-heading" className="mt-8 border-t border-border pt-7">
        <h3 id="commitments-heading" className="text-base font-medium text-foreground">
          Fixed commitments
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Complete and save today’s check-in before adding classes, appointments, or other fixed
          time.
        </p>
      </section>
    );
  }
  const currentDayPlan = dayPlan;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const start = fromUserDateTimeLocalString(startTime);
    const end = fromUserDateTimeLocalString(endTime);
    if (!normalizedTitle) {
      setLocalError("Give this commitment a short title.");
      return;
    }
    if (!start || !end) {
      setLocalError("Enter valid commitment times in America/Chicago.");
      return;
    }
    if (start >= end) {
      setLocalError("Commitment start time must be earlier than its end time.");
      return;
    }
    if (
      toUserDateString(start) !== currentDayPlan.planDate ||
      toUserDateString(end) !== currentDayPlan.planDate
    ) {
      setLocalError("Commitment times must stay within today’s Chicago date.");
      return;
    }

    setLocalError(null);
    const input: CreateCommitmentInput = {
      title: normalizedTitle,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      responsibilityArea: responsibilityArea || null,
    };
    if (await onCreate(input)) {
      setTitle("");
    }
  }

  const inputClassName =
    "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent";

  return (
    <section aria-labelledby="commitments-heading" className="mt-8 border-t border-border pt-7">
      <div className="flex flex-col gap-2">
        <h3 id="commitments-heading" className="text-base font-medium text-foreground">
          Fixed commitments
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Add time Echo must protect. Changing a commitment clears the current schedule so it can
          be rebuilt against the new constraint.
        </p>
      </div>

      {commitments.length > 0 && (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {commitments.map((commitment) => (
            <li
              key={commitment.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">{commitment.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatUserTime(new Date(commitment.startTime))}–
                  {formatUserTime(new Date(commitment.endTime))}
                  {commitment.responsibilityArea
                    ? ` · ${RESPONSIBILITY_AREA_LABELS[commitment.responsibilityArea]}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={isBusy}
                aria-label={`Remove ${commitment.title} commitment`}
                onClick={() => void onDelete(commitment.id)}
                className="text-xs text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUpdating ? "Updating…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted sm:col-span-2">
          Commitment
          <input
            type="text"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Class, appointment, meeting…"
            className={inputClassName}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          Starts
          <input
            type="datetime-local"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className={inputClassName}
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          Ends
          <input
            type="datetime-local"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className={inputClassName}
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted sm:col-span-2">
          Area (optional)
          <select
            value={responsibilityArea}
            onChange={(event) =>
              setResponsibilityArea(event.target.value as ResponsibilityArea | "")
            }
            className={inputClassName}
          >
            <option value="">No area</option>
            {RESPONSIBILITY_AREAS.map((area) => (
              <option key={area} value={area}>
                {RESPONSIBILITY_AREA_LABELS[area]}
              </option>
            ))}
          </select>
        </label>
        {localError && (
          <p role="alert" className="text-sm text-accent sm:col-span-2">
            {localError}
          </p>
        )}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isBusy}
            className="text-sm font-medium text-accent transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdating ? "Updating commitments…" : "Add commitment"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface TodayPlanProps {
  dayPlan: DayPlan | null;
  scheduleBlocks: ScheduleBlock[];
  unscheduled: Task[];
  isBusy: boolean;
  isUpdatingBlock: boolean;
  onUpdateTaskBlock: ReturnType<typeof useDayPlan>["updateScheduleTaskBlock"];
}

function TodayPlan({
  dayPlan,
  scheduleBlocks,
  unscheduled,
  isBusy,
  isUpdatingBlock,
  onUpdateTaskBlock,
}: TodayPlanProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (dayPlan?.status !== "generated") return null;

  const nextStep = selectNextStep(scheduleBlocks, now);
  const nextStepPresentation = nextStep ? presentScheduleBlock(nextStep) : null;
  const nextStepTiming = nextStep ? scheduleStepTiming(nextStep, now) : null;
  const nextStepLabel =
    nextStepTiming === "now"
      ? "Now"
      : nextStepTiming === "next"
        ? "Up next"
        : "Needs attention";

  return (
    <section aria-labelledby="today-plan-heading" className="mt-9 border-t border-border pt-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">The plan</p>
        <h3 id="today-plan-heading" className="text-xl font-semibold text-foreground">
          Today’s plan
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Commitments stay fixed. Task work and breaks reflect the capacity you shared today.
        </p>
      </div>

      {nextStep && nextStepPresentation && (
        <div className="mt-6 border-l-2 border-accent pl-4">
          <p className="text-xs uppercase tracking-[0.16em] text-accent">{nextStepLabel}</p>
          <p className="mt-1 text-base font-medium text-foreground">{nextStep.title}</p>
          <p className="mt-1 text-sm text-muted">
            {nextStepPresentation.timeRange} · {nextStepPresentation.kindLabel}
          </p>
        </div>
      )}

      {scheduleBlocks.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          {unscheduled.length > 0
            ? "Nothing fits inside the available window yet. Your open tasks remain visible below."
            : "There was nothing to schedule inside today’s available window."}
        </p>
      ) : (
        <ol className="mt-6 border-b border-border">
          {scheduleBlocks.map((block) => {
            const presentation = presentScheduleBlock(block);
            const isBreak = block.sourceType === "break";
            const isFinished = block.status !== "scheduled";
            return (
              <li
                key={block.id}
                aria-current={nextStep?.id === block.id ? "step" : undefined}
                className={`grid gap-2 border-t py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-6 ${
                  nextStep?.id === block.id ? "border-accent/50" : "border-border"
                }`}
              >
                <time
                  dateTime={block.startTime}
                  className="text-sm font-medium tabular-nums text-foreground"
                >
                  {presentation.timeRange}
                </time>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">
                    {presentation.kindLabel}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      isBreak || isFinished ? "text-muted" : "text-foreground"
                    } ${block.status === "completed" ? "line-through" : ""}`}
                  >
                    {block.title}
                  </p>
                  {block.responsibilityArea && (
                    <p className="mt-1 text-xs text-muted">
                      {RESPONSIBILITY_AREA_LABELS[block.responsibilityArea]}
                    </p>
                  )}
                  {block.status !== "scheduled" && (
                    <p className="mt-1 text-xs capitalize text-muted">{block.status}</p>
                  )}
                  {block.sourceType === "task" && block.status === "scheduled" && (
                    <div className="mt-3 flex flex-wrap gap-4">
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label={`Mark ${block.title} complete`}
                        onClick={() => void onUpdateTaskBlock(block.id, "completed")}
                        className="text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUpdatingBlock ? "Updating…" : "Done"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label={`Skip ${block.title} for today`}
                        onClick={() => void onUpdateTaskBlock(block.id, "skipped")}
                        className="text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Skip for today
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {unscheduled.length > 0 && (
        <div className="mt-7">
          <h4 className="text-sm font-medium text-foreground">Still unscheduled</h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            These stay visible because they were deferred or did not fit today’s time and capacity.
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {unscheduled.map((task) => (
              <li key={task.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-foreground">{task.title}</span>
                {task.estimatedMinutes !== null && (
                  <span className="shrink-0 text-xs text-muted">
                    {minutesLabel(task.estimatedMinutes)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface RegenerationReviewProps {
  proposal: DayPlanRegenerationProposalEnvelope;
  planningContext: PlanningContext | null;
  isBusy: boolean;
  isApplying: boolean;
  onApply: ReturnType<typeof useDayPlan>["applyRegeneration"];
  onDismiss: ReturnType<typeof useDayPlan>["dismissRegenerationProposal"];
}

function RegenerationReview({
  proposal,
  planningContext,
  isBusy,
  isApplying,
  onApply,
  onDismiss,
}: RegenerationReviewProps) {
  const groups = groupDayPlanRegenerationProposal(proposal);

  return (
    <section
      aria-labelledby="echo-recommendation-heading"
      className="mt-8 rounded-xl border border-border bg-foreground/[0.025] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Echo’s recommendation</p>
        <h3 id="echo-recommendation-heading" className="text-lg font-semibold text-foreground">
          A considered shape for today
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {proposal.recommendation.explanation}
        </p>
        {planningContext && (
          <p className="text-xs leading-5 text-muted">
            Based on {planningContext.capacityTier} capacity and a task-work limit of{" "}
            {minutesLabel(planningContext.maxScheduledTaskMinutes)}. Echo will leave exact timing,
            commitments, and breaks to the deterministic planner.
          </p>
        )}
      </div>

      {groups.length > 0 && (
        <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.disposition} className="border-t border-border pt-4">
              <h4 className="text-xs font-medium uppercase tracking-[0.14em] text-foreground">
                {group.label}
              </h4>
              <ul className="mt-3 flex flex-col gap-2.5">
                {group.tasks.map((task) => (
                  <li key={task.id} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-foreground">{task.title}</span>
                    {task.estimatedMinutes !== null && (
                      <span className="shrink-0 text-xs text-muted">
                        {minutesLabel(task.estimatedMinutes)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void onApply()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isApplying ? "Applying Echo’s recommendations…" : "Apply Echo’s recommendations"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onDismiss}
          className="text-sm text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}

export function DailyCheckInPanel() {
  const dayPlan = useDayPlan();
  const visibleError =
    dayPlan.clientError?.kind === "apply" && !dayPlan.regenerationProposal
      ? null
      : dayPlan.clientError;

  return (
    <section aria-labelledby="daily-check-in-heading" className="border-y border-border py-8">
      <div className="mb-7 flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Before the plan</p>
        <h2 id="daily-check-in-heading" className="text-2xl font-semibold text-foreground">
          How are you arriving today?
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Echo uses this to keep today realistic. Your commitments stay fixed; task workload adapts.
        </p>
      </div>

      {visibleError && (
        <p role="alert" className="mb-5 text-sm leading-6 text-accent">
          {dayPlanRegenerationErrorMessage(visibleError)}
        </p>
      )}

      {dayPlan.isLoading ? (
        <p className="text-sm text-muted">Loading today’s check-in…</p>
      ) : (
        <CheckInForm
          key={dayPlan.dayPlan?.id ?? "new-check-in"}
          initialDayPlan={dayPlan.dayPlan}
          planningContext={dayPlan.planningContext}
          isBusy={dayPlan.isBusy}
          isSaving={dayPlan.isSaving}
          isGenerating={dayPlan.isGenerating}
          isRegenerating={dayPlan.isRegenerating}
          onSave={dayPlan.saveCheckIn}
          onGenerate={dayPlan.saveAndGeneratePlan}
          onRegenerate={dayPlan.regenerateWithEcho}
          onCheckInChange={dayPlan.checkInInputChanged}
        />
      )}

      {!dayPlan.isLoading && (
        <CommitmentsEditor
          key={dayPlan.dayPlan?.id ?? "new-commitments"}
          dayPlan={dayPlan.dayPlan}
          commitments={dayPlan.commitments}
          isBusy={dayPlan.isBusy}
          isUpdating={dayPlan.isUpdatingCommitment}
          onCreate={dayPlan.createCommitment}
          onDelete={dayPlan.deleteCommitment}
        />
      )}

      <TodayPlan
        dayPlan={dayPlan.dayPlan}
        scheduleBlocks={dayPlan.scheduleBlocks}
        unscheduled={dayPlan.unscheduled}
        isBusy={dayPlan.isBusy}
        isUpdatingBlock={dayPlan.isUpdatingBlock}
        onUpdateTaskBlock={dayPlan.updateScheduleTaskBlock}
      />

      {dayPlan.regenerationProposal && (
        <RegenerationReview
          proposal={dayPlan.regenerationProposal}
          planningContext={dayPlan.regenerationPlanningContext}
          isBusy={dayPlan.isBusy}
          isApplying={dayPlan.isApplyingRegeneration}
          onApply={dayPlan.applyRegeneration}
          onDismiss={dayPlan.dismissRegenerationProposal}
        />
      )}
    </section>
  );
}
