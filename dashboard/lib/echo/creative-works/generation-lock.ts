// Fast single-process guard against a double-click before the button disables.
// The generation route also holds a database-backed AI operation lease around
// provider work and persistence so multi-instance concurrency remains safe.
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
