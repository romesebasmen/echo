// In-memory, single-process guard against concurrent generation requests for
// the same creative work (e.g. a double-click before the button disables).
// Module-scoped Set survives across requests within one running server
// process — sufficient for this single-user app with no background jobs or
// multi-instance deployment. Not a substitute for a DB-level lock if this
// ever runs across multiple instances.
const inFlightGenerations = new Set<string>();

export function tryAcquireGenerationLock(id: string): boolean {
  if (inFlightGenerations.has(id)) {
    return false;
  }
  inFlightGenerations.add(id);
  return true;
}

export function releaseGenerationLock(id: string): void {
  inFlightGenerations.delete(id);
}
