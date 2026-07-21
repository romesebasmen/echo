import type { RadarItem } from "@/lib/echo/types";
import { RadarItemCard } from "@/components/echo/RadarItemCard";

export function OnYourRadar({ items }: { items: RadarItem[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
        On Your Radar
      </h2>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <RadarItemCard key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
