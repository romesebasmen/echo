import type { EngagementSnapshot } from "@/lib/echo/types";
import { MetricDelta } from "@/components/echo/MetricDelta";

export function EngagementTracker({
  snapshot,
}: {
  snapshot: EngagementSnapshot;
}) {
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
