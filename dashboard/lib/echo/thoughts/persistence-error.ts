interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

const THOUGHT_ORIGIN_CONSTRAINT = "creative_works_thought_origin_fk";

export class ThoughtInUseError extends Error {
  constructor() {
    super(
      "This thought is used by Creator Loop. Remove the related creative work before deleting it.",
    );
    this.name = "ThoughtInUseError";
  }
}

export function throwIfThoughtInUse(error: PostgrestErrorLike): void {
  const safeDatabaseText = `${error.message ?? ""} ${error.details ?? ""}`;
  if (
    error.code === "23503" &&
    safeDatabaseText.includes(THOUGHT_ORIGIN_CONSTRAINT)
  ) {
    throw new ThoughtInUseError();
  }
}
