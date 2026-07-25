import type { CreativeWorkStatus } from "@/lib/echo/types";

// Workflow rule, not a repository concern — kept separate so the generic
// repository update stays a plain data write with no business logic baked
// in. "opportunity" -> "ready" is deliberately absent: that transition only
// happens as a side effect of a successful generation, never through this
// manual status PATCH path. "abandoned" is a valid DB status (from the
// creative_works schema) but this slice exposes no transition into it.
const ALLOWED_TRANSITIONS: Record<CreativeWorkStatus, CreativeWorkStatus[]> = {
  opportunity: [],
  ready: ["filming"],
  filming: ["editing"],
  editing: ["posted"],
  posted: [],
  abandoned: [],
};

export function isValidStatusTransition(
  from: CreativeWorkStatus,
  to: CreativeWorkStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
