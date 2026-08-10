export const AI_OPERATION_LEASE_TTL_SECONDS = 15 * 60;

const OPERATION_KEY_PATTERN = /^[a-z0-9][a-z0-9:-]{0,159}$/;

export interface AiOperationLease {
  operationKey: string;
  leaseId: string;
}

export class AiOperationInProgressError extends Error {
  constructor() {
    super("Echo is already handling this AI operation.");
    this.name = "AiOperationInProgressError";
  }
}

export class AiOperationLeaseUnavailableError extends Error {
  readonly operation: "acquire" | "release";
  readonly code: string | null;

  constructor(operation: "acquire" | "release", code: string | null = null) {
    super(`Echo could not ${operation} its AI operation lease.`);
    this.name = "AiOperationLeaseUnavailableError";
    this.operation = operation;
    this.code = code;
  }
}

export interface AiOperationLeaseRunnerDependencies {
  acquire: (
    operationKey: string,
    leaseId: string,
    ttlSeconds: number,
  ) => Promise<boolean>;
  release: (operationKey: string, leaseId: string) => Promise<boolean>;
  createLeaseId: () => string;
  reportReleaseError?: (error: AiOperationLeaseUnavailableError) => void;
}

export interface AiOperationLeaseRpcError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export type AiOperationLeaseRpcCaller = (
  functionName: string,
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error: AiOperationLeaseRpcError | null }>;

function safeErrorCode(error: AiOperationLeaseRpcError): string | null {
  return typeof error.code === "string" && /^[A-Z0-9]{2,10}$/.test(error.code)
    ? error.code
    : null;
}

function assertBooleanRpcResult(
  operation: "acquire" | "release",
  data: unknown,
  error: AiOperationLeaseRpcError | null,
): boolean {
  if (error) {
    throw new AiOperationLeaseUnavailableError(operation, safeErrorCode(error));
  }
  if (typeof data !== "boolean") {
    throw new AiOperationLeaseUnavailableError(operation);
  }
  return data;
}

export async function acquireAiOperationLeaseWithRpc(
  operationKey: string,
  leaseId: string,
  ttlSeconds: number,
  callRpc: AiOperationLeaseRpcCaller,
): Promise<boolean> {
  const { data, error } = await callRpc("acquire_ai_operation_lease", {
    p_operation_key: operationKey,
    p_lease_id: leaseId,
    p_ttl_seconds: ttlSeconds,
  });
  return assertBooleanRpcResult("acquire", data, error);
}

export async function releaseAiOperationLeaseWithRpc(
  operationKey: string,
  leaseId: string,
  callRpc: AiOperationLeaseRpcCaller,
): Promise<boolean> {
  const { data, error } = await callRpc("release_ai_operation_lease", {
    p_operation_key: operationKey,
    p_lease_id: leaseId,
  });
  return assertBooleanRpcResult("release", data, error);
}

export function createAiOperationKey(
  scope: "briefing" | "chat" | "day-plan-regeneration" | "tiktok-package",
  identifier: string,
): string {
  const operationKey = `${scope}:${identifier}`;
  if (!OPERATION_KEY_PATTERN.test(operationKey)) {
    throw new AiOperationLeaseUnavailableError("acquire");
  }
  return operationKey;
}

export function createAiOperationLeaseRunner(
  dependencies: AiOperationLeaseRunnerDependencies,
): <T>(operationKey: string, operation: () => Promise<T>) => Promise<T> {
  return async function runWithAiOperationLease<T>(
    operationKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!OPERATION_KEY_PATTERN.test(operationKey)) {
      throw new AiOperationLeaseUnavailableError("acquire");
    }

    const leaseId = dependencies.createLeaseId();
    let acquired: boolean;
    try {
      acquired = await dependencies.acquire(
        operationKey,
        leaseId,
        AI_OPERATION_LEASE_TTL_SECONDS,
      );
    } catch (error) {
      if (error instanceof AiOperationLeaseUnavailableError) {
        throw error;
      }
      throw new AiOperationLeaseUnavailableError("acquire");
    }

    if (!acquired) {
      throw new AiOperationInProgressError();
    }

    try {
      return await operation();
    } finally {
      try {
        await dependencies.release(operationKey, leaseId);
      } catch (error) {
        const safeError =
          error instanceof AiOperationLeaseUnavailableError
            ? error
            : new AiOperationLeaseUnavailableError("release");
        dependencies.reportReleaseError?.(safeError);
      }
    }
  };
}
