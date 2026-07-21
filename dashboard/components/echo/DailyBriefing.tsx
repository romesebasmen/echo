"use client";

import { useBriefing } from "@/lib/echo/daily-briefing/useBriefing";

export function DailyBriefing() {
  const { briefing, isLoading, isRefreshing, error, refresh } = useBriefing();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
          Today&rsquo;s Briefing
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading || isRefreshing}
          className="text-sm text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing…" : "Refresh briefing"}
        </button>
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-muted">Putting today&rsquo;s briefing together…</p>
      ) : !briefing ? (
        <p className="text-sm text-muted">No briefing yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="max-w-prose text-lg leading-relaxed text-foreground">
            {briefing.greeting}
          </p>

          <p className="max-w-prose text-base leading-relaxed text-foreground">
            {briefing.whatChanged}
          </p>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted">
              {briefing.patternNoticed.kind === "pattern"
                ? "Pattern noticed"
                : "Hypothesis"}
            </span>
            <p className="max-w-prose text-base leading-relaxed text-foreground">
              {briefing.patternNoticed.text}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted">
              Today&rsquo;s recommendation
            </span>
            <p className="max-w-prose text-base leading-relaxed text-foreground">
              {briefing.bestRecommendation}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted">
              Next action
            </span>
            <p className="max-w-prose text-base leading-relaxed text-foreground">
              {briefing.nextAction}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
