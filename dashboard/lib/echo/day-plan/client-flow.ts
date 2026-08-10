import type {
  ApplyDayPlanRegenerationRequest,
  DayPlanRegenerationProposalEnvelope,
} from "../types/day-plan-regeneration.ts";
import {
  runExclusiveClientOperation,
  type OperationGate as SharedOperationGate,
} from "../client/operation-gate.ts";

export type OperationGate = SharedOperationGate;
export const runExclusiveOperation = runExclusiveClientOperation;

export class DayPlanClientRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DayPlanClientRequestError";
    this.status = status;
  }
}

export function isStaleDayPlanClientError(error: unknown): boolean {
  return error instanceof DayPlanClientRequestError && error.status === 409;
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

export async function saveThenRequestRegeneration<Input, Saved, Proposal>(
  input: Input,
  save: (input: Input) => Promise<Saved>,
  requestRegeneration: (saved: Saved) => Promise<Proposal>,
  storeProposal: (proposal: Proposal) => void,
): Promise<{ saved: Saved; proposal: Proposal }> {
  const saved = await save(input);
  const proposal = await requestRegeneration(saved);
  storeProposal(proposal);
  return { saved, proposal };
}

export function regenerationApplicationFromProposal(
  proposal: DayPlanRegenerationProposalEnvelope,
): ApplyDayPlanRegenerationRequest {
  return {
    schemaVersion: proposal.schemaVersion,
    recommendation: proposal.recommendation,
    inputFingerprint: proposal.inputFingerprint,
    expectedCheckInCompletedAt: proposal.expectedCheckInCompletedAt,
  };
}

export async function applyStoredRegenerationProposal<Generated>(
  proposal: DayPlanRegenerationProposalEnvelope,
  apply: (request: ApplyDayPlanRegenerationRequest) => Promise<Generated>,
  applyGeneratedState: (generated: Generated) => void,
  clearProposal: () => void,
): Promise<Generated> {
  try {
    const generated = await apply(regenerationApplicationFromProposal(proposal));
    applyGeneratedState(generated);
    clearProposal();
    return generated;
  } catch (error) {
    if (isStaleDayPlanClientError(error)) clearProposal();
    throw error;
  }
}

export function invalidateStoredRegenerationProposal(clearProposal: () => void): void {
  clearProposal();
}
