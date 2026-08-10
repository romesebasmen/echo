import { toUserDateString } from "../timezone.ts";

export function getBriefingDate(now = new Date()): string {
  return toUserDateString(now);
}
