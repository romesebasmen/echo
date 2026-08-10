// Single-process request coalescing for the current single-user deployment.
// Concurrent GET/refresh requests for one Chicago day share one generation
// promise, preventing duplicate paid calls from double effects or clicks.
// A database-backed lease would be required for multi-instance deployment.
const inFlightByDate = new Map<string, Promise<unknown>>();

export function runBriefingGenerationSingleFlight<T>(
  briefingDate: string,
  generate: () => Promise<T>,
): Promise<T> {
  const existing = inFlightByDate.get(briefingDate) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  let pending: Promise<T>;
  try {
    pending = generate();
  } catch (error) {
    return Promise.reject(error);
  }
  inFlightByDate.set(briefingDate, pending);
  pending.then(
    () => {
      if (inFlightByDate.get(briefingDate) === pending) {
        inFlightByDate.delete(briefingDate);
      }
    },
    () => {
      if (inFlightByDate.get(briefingDate) === pending) {
        inFlightByDate.delete(briefingDate);
      }
    },
  );

  return pending;
}
