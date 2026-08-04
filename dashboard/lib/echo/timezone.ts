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

function userWallClockParts(date: Date): Record<string, number> {
  const parts = userWallClockFormatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function toUserDateTimeLocalString(date: Date): string {
  const parts = userWallClockParts(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

// Converts an America/Chicago wall-clock value from a datetime-local input
// to an absolute instant. Invalid dates and nonexistent spring-forward times
// are rejected by the final round-trip check.
export function fromUserDateTimeLocalString(value: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;

  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const normalized = new Date(targetAsUtc);
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }

  let instantMs = targetAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = userWallClockParts(new Date(instantMs));
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
    );
    const adjustment = targetAsUtc - actualAsUtc;
    if (adjustment === 0) break;
    instantMs += adjustment;
  }

  const instant = new Date(instantMs);
  return toUserDateTimeLocalString(instant) === value ? instant : null;
}

export function parseTimestampWithExplicitOffset(value: string): Date | null {
  if (!/(?:z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isSameUserDay(a: Date, b: Date): boolean {
  return toUserDateString(a) === toUserDateString(b);
}

// The UTC instant corresponding to 00:00:00 in the user's timezone, for the
// calendar day containing `date`. DST-safe: the offset is derived fresh
// from the actual instant via Intl (which knows real America/Chicago DST
// rules) rather than a fixed constant.
export function startOfUserDay(date: Date): Date {
  const parts = userWallClockParts(date);

  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMs = wallClockAsUtc - date.getTime();

  const midnightWallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
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
