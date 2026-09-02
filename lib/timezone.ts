/**
 * Timezone helpers.
 *
 * LifeOS schedules in the USER's wall clock, not the server's. The app runs in a
 * container whose local time is UTC, so `new Date().setHours(9)` meant 09:00 UTC
 * = 14:30 IST - which is why a "9:00 AM" block landed on the calendar at 2:30 PM.
 * Every wall-clock <-> instant conversion goes through here, explicitly.
 *
 * Instants stay real UTC `Date`s everywhere else (so they compare correctly with
 * Google FreeBusy). Only the day/work-hour BOUNDARIES are zone-aware.
 */

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export function getTimeZone(): string {
  return process.env.LIFEOS_TIMEZONE || DEFAULT_TIME_ZONE;
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string; // 'Mon', 'Tue', ...
}

function partsInZone(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // 'hour12: false' can render midnight as 24 in some ICU versions.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday,
  };
}

/** How far the zone's wall clock runs ahead of UTC at this instant, in ms. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant at which the given wall-clock time occurs in `timeZone`. */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // First guess uses the offset in force at the naive timestamp; the second pass
  // settles DST boundaries where that guess picked the wrong side of the shift.
  let instant = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  instant = new Date(naive - zoneOffsetMs(instant, timeZone));
  return instant;
}

/** Instant of `hour:minute` on whatever calendar day `reference` falls on in `timeZone`. */
export function zonedWallClock(
  reference: Date,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const p = partsInZone(reference, timeZone);
  return zonedTimeToInstant(p.year, p.month, p.day, hour, minute, timeZone);
}

/** First and last instants of the zone's calendar day containing `reference`. */
export function zonedDayBounds(reference: Date, timeZone: string): { start: Date; end: Date } {
  const p = partsInZone(reference, timeZone);
  const start = zonedTimeToInstant(p.year, p.month, p.day, 0, 0, timeZone);
  // Date.UTC normalises day+1 across month/year rollover for us.
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const nextStart = zonedTimeToInstant(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    timeZone
  );
  return { start, end: new Date(nextStart.getTime() - 1) };
}

const RRULE_DAY: Record<string, string> = {
  Sun: 'SU', Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA',
};

/** RRULE weekday code (SU..SA) for an instant, as seen in the zone. */
export function rruleWeekday(date: Date, timeZone: string): string {
  return RRULE_DAY[partsInZone(date, timeZone).weekday] || 'MO';
}

/** Human label for the agent and UI, e.g. "9:00 am". Time only - see below. */
export function formatInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Full local date AND time, e.g. "Thu, 03 Sep 2026, 1:43 am".
 *
 * The agent used to be given the local TIME plus a UTC ISO instant, so the only
 * date it could read was the UTC one. Between 00:00 and 05:30 IST those are
 * different days, and it confidently reported "Wed Sep 2" at 1:43 am on Thursday
 * the 3rd. Anything that states a date to the user must use this, not the instant.
 */
export function formatDateTimeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
