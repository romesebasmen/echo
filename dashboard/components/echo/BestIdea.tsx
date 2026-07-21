import type { IdeaOfTheDay } from "@/lib/echo/types";

const EVIDENCE_LABEL: Record<
  IdeaOfTheDay["evidenceBasis"][number]["kind"],
  string
> = {
  explicit: "You said",
  pattern: "Pattern observed",
  hypothesis: "Hypothesis",
};

export function BestIdea({ idea }: { idea: IdeaOfTheDay }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl bg-surface px-6 py-8 sm:px-10 sm:py-10">
      <span className="text-xs font-medium uppercase tracking-wide text-accent">
        Best Idea of the Day
      </span>

      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {idea.title}
        </h2>
        <p className="max-w-prose text-lg leading-relaxed text-foreground">
          {idea.concept}
        </p>
      </div>

      <p className="max-w-prose border-l-2 border-accent pl-4 text-base leading-relaxed text-foreground italic">
        {idea.hook}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
        <span className="text-foreground">{idea.platform}</span>
        <span aria-hidden="true">·</span>
        <span>{idea.effort} effort</span>
        <span aria-hidden="true">·</span>
        <span>
          <span className="text-accent">{idea.confidence}</span> confidence
        </span>
        {idea.seriesPotential && (
          <>
            <span aria-hidden="true">·</span>
            <span>Series: {idea.seriesPotential}</span>
          </>
        )}
      </div>

      <div className="max-w-prose text-base leading-relaxed text-muted">
        {idea.whyItFits}
      </div>

      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted transition-colors [&::-webkit-details-marker]:hidden hover:text-accent focus-visible:text-accent focus-visible:outline-none">
          <span
            aria-hidden="true"
            className="inline-block transition-transform group-open:rotate-45"
          >
            +
          </span>
          Why Echo suggests this
        </summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {idea.evidenceBasis.map((evidence) => (
            <li
              key={evidence.label}
              className="max-w-prose text-sm leading-relaxed text-foreground"
            >
              <span className="text-muted">
                {EVIDENCE_LABEL[evidence.kind]}:{" "}
              </span>
              {evidence.label}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
