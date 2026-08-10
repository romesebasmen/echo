import "server-only";

import { randomUUID } from "node:crypto";
import { formatError } from "../errors.ts";
import {
  acquireAiOperationLease,
  releaseAiOperationLease,
} from "./operation-lease-repository.ts";
import { createAiOperationLeaseRunner } from "./operation-lease.ts";

export const runWithAiOperationLease = createAiOperationLeaseRunner({
  acquire: acquireAiOperationLease,
  release: releaseAiOperationLease,
  createLeaseId: randomUUID,
  reportReleaseError(error) {
    console.error("AI operation lease release failed:", formatError(error));
  },
});
