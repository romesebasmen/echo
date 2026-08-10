import { formatError } from "../errors.ts";
import {
  CommitmentDayPlanNotFoundError,
  CommitmentNotFoundError,
  InvalidCommitmentPersistenceError,
  MissingCommitmentsTableError,
  MissingCommitmentMutationMigrationError,
  MissingDayPlansTableError,
} from "./repository.ts";
import { MissingScheduleBlocksTableError } from "./schedule-blocks-repository.ts";
import { MissingTasksTableError } from "../tasks/repository.ts";
import { InvalidCommitmentRequestError } from "./commitment-request.ts";

export function handleCommitmentHttpError(
  routeLabel: string,
  error: unknown,
): Response {
  if (error instanceof InvalidCommitmentRequestError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof CommitmentNotFoundError ||
    error instanceof CommitmentDayPlanNotFoundError
  ) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidCommitmentPersistenceError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof MissingCommitmentMutationMigrationError) {
    console.error(`${routeLabel} failed: commitment-management migration is missing.`);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (
    error instanceof MissingCommitmentsTableError ||
    error instanceof MissingDayPlansTableError ||
    error instanceof MissingScheduleBlocksTableError ||
    error instanceof MissingTasksTableError
  ) {
    console.error(`${routeLabel} failed: a required planning table is missing.`);
    return Response.json(
      {
        error:
          "A required planning table is missing. Apply the version-controlled Supabase migrations, then try again.",
      },
      { status: 500 },
    );
  }

  console.error(`${routeLabel} failed:`, formatError(error));
  return Response.json(
    { error: "Could not update today's commitments." },
    { status: 500 },
  );
}
