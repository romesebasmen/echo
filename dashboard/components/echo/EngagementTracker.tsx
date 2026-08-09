import type { EngagementState } from "@/lib/echo/types";
import { MetricDelta } from "@/components/echo/MetricDelta";
import {
  getAvailableEngagementSnapshot,
  NOT_CONNECTED_ENGAGEMENT_MESSAGE,
  SOCIAL_CONNECTIONS_UNAVAILABLE_MESSAGE,
} from "@/lib/echo/daily-briefing/engagement";

export function EngagementTracker({
  state,
}: {
  state: EngagementState;
}) {
  const snapshot = getAvailableEngagementSnapshot(state);

  if (!snapshot) {
    const message =
      state.status === "not-connected"
        ? NOT_CONNECTED_ENGAGEMENT_MESSAGE
        : "Verified engagement data is temporarily unavailable. Echo won’t substitute stale or unverified metrics.";

    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
          Engagement
        </h2>
        <div className="flex max-w-prose flex-col gap-1.5">
          <p className="text-base leading-relaxed text-foreground">{message}</p>
          {state.status === "not-connected" && (
            <p className="text-sm leading-relaxed text-muted">
              {SOCIAL_CONNECTIONS_UNAVAILABLE_MESSAGE}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
          Engagement
        </h2>
        <span className="text-sm text-muted">Since {snapshot.since}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-5">
        {snapshot.metrics.map((metric) => (
          <MetricDelta
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <p className="max-w-prose text-base leading-relaxed text-foreground">
          {snapshot.bestPlatform} is your best-performing platform right now,
          led by &ldquo;{snapshot.bestPost}&rdquo;.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-muted">
          {snapshot.insight}
        </p>
      </div>
    </section>
  );
}
