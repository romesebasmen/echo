export function MetricDelta({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const formatted = `${value > 0 ? "+" : ""}${value.toLocaleString()}`;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-2xl font-semibold text-foreground tabular-nums sm:text-3xl">
        {formatted}
      </span>
    </div>
  );
}
