// Fast single-process request coalescing: concurrent requests for one Chicago
// day share one promise. The generator also holds a database-backed AI
// operation lease, which is the cross-instance paid-call boundary.
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
