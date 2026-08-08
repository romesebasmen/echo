"use client";

import { useState, type FormEvent } from "react";
import { useDayPlan } from "@/lib/echo/day-plan/useDayPlan";
import type { SaveDayPlanInput } from "@/lib/echo/day-plan/useDayPlan";
import {
  fromUserDateTimeLocalString,
  toUserDateString,
  toUserDateTimeLocalString,
} from "@/lib/echo/timezone";
import type { DayPlan, PlanningContext, SleepQuality } from "@/lib/echo/types";

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
  scheduleBlockCount: number;
  unscheduledCount: number;
  onSave: ReturnType<typeof useDayPlan>["saveCheckIn"];
  onGenerate: ReturnType<typeof useDayPlan>["saveAndGeneratePlan"];
  onCheckInChange: ReturnType<typeof useDayPlan>["checkInInputChanged"];
}

function CheckInForm({
  initialDayPlan,
  planningContext,
  isBusy,
  isSaving,
  isGenerating,
  scheduleBlockCount,
  unscheduledCount,
  onSave,
  onGenerate,
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
      </div>

      {planningContext && (
        <p className="text-sm leading-6 text-muted">
          Echo is planning for <span className="text-foreground">{planningContext.capacityTier}</span>{" "}
          capacity: up to {minutesLabel(planningContext.maxScheduledTaskMinutes)} of task work,
          with a break after {planningContext.breakAfterMinutes} minutes.
        </p>
      )}

      {scheduleBlockCount > 0 && (
        <p className="text-sm text-muted">
          Today’s plan has {scheduleBlockCount} scheduled block
          {scheduleBlockCount === 1 ? "" : "s"}.
          {unscheduledCount > 0
            ? ` ${unscheduledCount} task${unscheduledCount === 1 ? " is" : "s are"} still visible for later.`
            : " Everything selected fits within today’s capacity."}
        </p>
      )}
    </form>
  );
}

export function DailyCheckInPanel() {
  const dayPlan = useDayPlan();

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

      {dayPlan.error && <p className="mb-5 text-sm text-accent">{dayPlan.error}</p>}

      {dayPlan.isLoading ? (
        <p className="text-sm text-muted">Loading today’s check-in…</p>
      ) : (
        <CheckInForm
          key={dayPlan.dayPlan?.updatedAt ?? "new-check-in"}
          initialDayPlan={dayPlan.dayPlan}
          planningContext={dayPlan.planningContext}
          isBusy={dayPlan.isBusy}
          isSaving={dayPlan.isSaving}
          isGenerating={dayPlan.isGenerating}
          scheduleBlockCount={dayPlan.scheduleBlocks.length}
          unscheduledCount={dayPlan.unscheduled.length}
          onSave={dayPlan.saveCheckIn}
          onGenerate={dayPlan.saveAndGeneratePlan}
          onCheckInChange={dayPlan.checkInInputChanged}
        />
      )}
    </section>
  );
}
