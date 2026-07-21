import type { RadarItem } from "@/lib/echo/types";

export function RadarItemCard({ item }: { item: RadarItem }) {
  return (
    <li className="flex flex-col gap-2 py-6">
      <div className="flex flex-wrap items-center gap-x-2 text-xs uppercase tracking-wide text-muted">
        <span>{item.tag}</span>
        <span aria-hidden="true">·</span>
        <span>{item.source}</span>
        <span aria-hidden="true">·</span>
        <span>{item.freshness}</span>
      </div>

      <h3 className="text-lg font-medium text-foreground sm:text-xl">
        {item.headline}
      </h3>

      <p className="max-w-prose text-base leading-relaxed text-muted">
        {item.context}
      </p>

      <p className="max-w-prose text-base leading-relaxed text-foreground">
        {item.whyItMatters}
      </p>

      <details className="group mt-1">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted transition-colors [&::-webkit-details-marker]:hidden hover:text-accent focus-visible:text-accent focus-visible:outline-none">
          <span
            aria-hidden="true"
            className="inline-block transition-transform group-open:rotate-45"
          >
            +
          </span>
          Possible angle
        </summary>
        <p className="max-w-prose pt-2 text-base leading-relaxed text-foreground">
          {item.contentAngle}
        </p>
      </details>
    </li>
  );
}
