import {
  DayPlanNotFoundError,
  IncompleteCheckInError,
  InvalidAvailableTimeRangeError,
  InvalidCheckInStateError,
  type GenerateAndPersistDayPlanResult,
} from "./service.ts";
import {
  DayPlanRecommendationProviderUnavailableError,
  InvalidDayPlanRecommendationProviderOutputError,
  InvalidDayPlanRegenerationApplicationError,
  StaleDayPlanRegenerationProposalError,
  type ProposeDayPlanRegenerationResult,
} from "./regeneration-service.ts";
import { InvalidDayPlanRegenerationProposalError } from "./regeneration-proposal.ts";
import { MissingDailyCheckInMigrationError } from "./migration-error.ts";
import { formatError } from "../errors.ts";

export class MalformedDayPlanRegenerationRequestError extends Error {
  constructor(reason: string) {
    super(`Invalid day-plan regeneration request: ${reason}`);
    this.name = "MalformedDayPlanRegenerationRequestError";
  }
}

export interface ProposeDayPlanRegenerationHttpDeps {
  propose: (expectedCheckInCompletedAt: string) => Promise<ProposeDayPlanRegenerationResult>;
  logError?: (message: string) => void;
}

export interface ApplyDayPlanRegenerationHttpDeps {
  apply: (request: unknown) => Promise<GenerateAndPersistDayPlanResult>;
  logError?: (message: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new MalformedDayPlanRegenerationRequestError("body must be valid JSON");
  }
}

function parseProposeRequest(value: unknown): string {
  if (!isRecord(value) || !hasExactKeys(value, ["expectedCheckInCompletedAt"])) {
    throw new MalformedDayPlanRegenerationRequestError(
      "body must contain exactly expectedCheckInCompletedAt",
    );
  }
  if (
    typeof value.expectedCheckInCompletedAt !== "string" ||
    value.expectedCheckInCompletedAt.length === 0
  ) {
    throw new MalformedDayPlanRegenerationRequestError(
      "expectedCheckInCompletedAt must be a non-empty string",
    );
  }
  return value.expectedCheckInCompletedAt;
}

function parseApplyRequest(value: unknown): Record<string, unknown> {
  const expectedKeys = [
    "schemaVersion",
    "recommendation",
    "inputFingerprint",
    "expectedCheckInCompletedAt",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new MalformedDayPlanRegenerationRequestError(
      `body must contain exactly ${expectedKeys.join(", ")}`,
    );
  }
  if (value.schemaVersion !== 1) {
    throw new MalformedDayPlanRegenerationRequestError("schemaVersion must be 1");
  }
  if (!isRecord(value.recommendation)) {
    throw new MalformedDayPlanRegenerationRequestError("recommendation must be an object");
  }
  if (
    typeof value.inputFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.inputFingerprint)
  ) {
    throw new MalformedDayPlanRegenerationRequestError(
      "inputFingerprint must be a 64-character lowercase hexadecimal SHA-256 fingerprint",
    );
  }
  if (
    typeof value.expectedCheckInCompletedAt !== "string" ||
    value.expectedCheckInCompletedAt.length === 0
  ) {
    throw new MalformedDayPlanRegenerationRequestError(
      "expectedCheckInCompletedAt must be a non-empty string",
    );
  }

  return {
    schemaVersion: value.schemaVersion,
    recommendation: value.recommendation,
    inputFingerprint: value.inputFingerprint,
    expectedCheckInCompletedAt: value.expectedCheckInCompletedAt,
  };
}

function errorResponse(
  routeLabel: string,
  error: unknown,
  logError: (message: string) => void,
): Response {
  if (
    error instanceof MalformedDayPlanRegenerationRequestError ||
    error instanceof InvalidDayPlanRegenerationApplicationError ||
    error instanceof InvalidDayPlanRegenerationProposalError ||
    error instanceof InvalidCheckInStateError ||
    error instanceof InvalidAvailableTimeRangeError
  ) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DayPlanNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof IncompleteCheckInError ||
    error instanceof StaleDayPlanRegenerationProposalError
  ) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (
    error instanceof DayPlanRecommendationProviderUnavailableError ||
    error instanceof InvalidDayPlanRecommendationProviderOutputError
  ) {
    logError(`${routeLabel} failed: ${formatError(error)}`);
    return Response.json({ error: error.message }, { status: 502 });
  }
  if (error instanceof MissingDailyCheckInMigrationError) {
    logError(`${routeLabel} failed: daily-checkin migration is missing.`);
    return Response.json({ error: error.message }, { status: 500 });
  }

  logError(`${routeLabel} failed: ${formatError(error)}`);
  return Response.json({ error: "Could not regenerate today's plan." }, { status: 500 });
}

export function createProposeDayPlanRegenerationHandler(
  deps: ProposeDayPlanRegenerationHttpDeps,
): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    try {
      const expectedCheckInCompletedAt = parseProposeRequest(await requestJson(request));
      const result = await deps.propose(expectedCheckInCompletedAt);
      return Response.json(result);
    } catch (error) {
      return errorResponse(
        "POST /api/day-plan/regenerate",
        error,
        deps.logError ?? console.error,
      );
    }
  };
}

export function createApplyDayPlanRegenerationHandler(
  deps: ApplyDayPlanRegenerationHttpDeps,
): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    try {
      const application = parseApplyRequest(await requestJson(request));
      const result = await deps.apply(application);
      return Response.json(result);
    } catch (error) {
      return errorResponse(
        "POST /api/day-plan/regenerate/apply",
        error,
        deps.logError ?? console.error,
      );
    }
  };
}
