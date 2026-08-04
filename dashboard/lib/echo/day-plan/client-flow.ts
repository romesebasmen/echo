export interface OperationGate {
  busy: boolean;
}

export async function runExclusiveOperation<T>(
  gate: OperationGate,
  operation: () => Promise<T>,
): Promise<{ executed: false } | { executed: true; value: T }> {
  if (gate.busy) return { executed: false };
  gate.busy = true;
  try {
    return { executed: true, value: await operation() };
  } finally {
    gate.busy = false;
  }
}

export async function saveThenGenerate<Input, Saved, Generated>(
  input: Input,
  save: (input: Input) => Promise<Saved>,
  generate: () => Promise<Generated>,
): Promise<{ saved: Saved; generated: Generated }> {
  const saved = await save(input);
  const generated = await generate();
  return { saved, generated };
}
