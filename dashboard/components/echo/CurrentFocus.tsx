export function CurrentFocus({ reminder }: { reminder: string }) {
  return (
    <section className="border-t border-border pt-8">
      <p className="max-w-prose text-base leading-relaxed text-muted">
        <span className="font-medium text-foreground">Current focus. </span>
        {reminder}
      </p>
    </section>
  );
}
