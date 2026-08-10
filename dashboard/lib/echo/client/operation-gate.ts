export interface OperationGate {
  busy: boolean;
}

export type OperationResult<T> =
  | { executed: false }
  | { executed: true; value: T };

// React state updates are asynchronous, so a disabled button alone cannot
// stop a second event that lands in the same render. This mutable gate is the
// synchronous boundary shared by client mutation flows.
export async function runExclusiveClientOperation<T>(
  gate: OperationGate,
  operation: () => Promise<T>,
): Promise<OperationResult<T>> {
  if (gate.busy) return { executed: false };
  gate.busy = true;
  try {
    return { executed: true, value: await operation() };
  } finally {
    gate.busy = false;
  }
}
