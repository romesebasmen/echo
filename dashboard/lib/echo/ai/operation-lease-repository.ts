import "server-only";

import { callSupabaseServiceRoleRpc } from "../supabase/service-role-client.ts";
import {
  acquireAiOperationLeaseWithRpc,
  releaseAiOperationLeaseWithRpc,
} from "./operation-lease.ts";

export async function acquireAiOperationLease(
  operationKey: string,
  leaseId: string,
  ttlSeconds: number,
): Promise<boolean> {
  return acquireAiOperationLeaseWithRpc(
    operationKey,
    leaseId,
    ttlSeconds,
    callSupabaseServiceRoleRpc,
  );
}

export async function releaseAiOperationLease(
  operationKey: string,
  leaseId: string,
): Promise<boolean> {
  return releaseAiOperationLeaseWithRpc(
    operationKey,
    leaseId,
    callSupabaseServiceRoleRpc,
  );
}
