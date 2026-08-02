// Centralized timezone configuration — the only place a timezone is
// hardcoded anywhere in Echo. Every day-boundary, urgency, or staleness
// calculation in the Task Engine must go through these helpers instead of
// raw Date arithmetic, which would silently use the server's timezone
// (UTC in most deployments) instead of Sebastián's actual day.
export const USER_TIME_ZONE = "America/Chicago";

const userDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: USER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const userWallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: USER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// "YYYY-MM-DD" as the date would read on a calendar in the user's timezone
// for the given instant.
export function toUserDateString(date: Date): string {
  return userDateFormatter.format(date);
}

export function isSameUserDay(a: Date, b: Date): boolean {
  return toUserDateString(a) === toUserDateString(b);
}

// The UTC instant corresponding to 00:00:00 in the user's timezone, for the
// calendar day containing `date`. DST-safe: the offset is derived fresh
// from the actual instant via Intl (which knows real America/Chicago DST
// rules) rather than a fixed constant.
export function startOfUserDay(date: Date): Date {
  const parts = userWallClockFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = wallClockAsUtc - date.getTime();

  const midnightWallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0);
  return new Date(midnightWallClockAsUtc - offsetMs);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Whole calendar-day difference, in the user's timezone, from `from` to
// `to` (positive if `to` is later). Rounded rather than floored: on the two
// DST-transition days in America/Chicago, the true elapsed time between two
// local midnights is 23h or 25h, not exactly 24h — rounding still yields
// the correct whole-day count on those days.
export function calendarDayDifference(from: Date, to: Date): number {
  const fromMidnight = startOfUserDay(from);
  const toMidnight = startOfUserDay(to);
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / MS_PER_DAY);
}
