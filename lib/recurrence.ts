import { rruleWeekday } from './timezone';

/**
 * Which days a recurring task actually belongs on.
 *
 * The scheduler used to ignore `recurrence` entirely and slot every active task
 * into today, so a routine set to RRULE:FREQ=WEEKLY;BYDAY=TU,TH,SU was booked on
 * a Monday as well - on top of the real series - which is what showed up as
 * duplicate and overlapping calendar blocks.
 */

const VALID_DAYS = new Set(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']);

interface ParsedRule {
  freq?: string;
  byDay: string[];
}

/** Pull FREQ and BYDAY out of an RRULE string. Unknown parts are ignored. */
export function parseRrule(rrule: string): ParsedRule {
  const body = rrule.replace(/^RRULE:/i, '');
  const out: ParsedRule = { byDay: [] };

  for (const chunk of body.split(';')) {
    const [rawKey, rawValue] = chunk.split('=');
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim().toUpperCase();
    const value = rawValue.trim().toUpperCase();

    if (key === 'FREQ') out.freq = value;
    if (key === 'BYDAY') {
      out.byDay = value
        .split(',')
        // Strip any ordinal prefix ("2MO" = second Monday of the month).
        .map((d) => d.replace(/^[+-]?\d+/, '').trim())
        .filter((d) => VALID_DAYS.has(d));
    }
  }

  return out;
}

/**
 * Is a task with this recurrence due on `date`?
 *
 * Anything we cannot confidently rule out returns true: a task wrongly offered
 * for scheduling is a visible nuisance the user can decline, whereas one wrongly
 * withheld silently disappears from their day.
 */
export function isDueOn(
  recurrence: string | undefined,
  date: Date,
  timeZone: string
): boolean {
  // One-off tasks are always eligible.
  if (!recurrence) return true;

  const value = recurrence.trim();
  if (!value) return true;

  // 'weekly' with no anchor day takes its weekday from whenever it is scheduled,
  // so it cannot be excluded from today.
  if (!/^RRULE:/i.test(value)) return true;

  const rule = parseRrule(value);

  // A day list is the only thing that pins a rule to specific weekdays.
  if (rule.byDay.length === 0) return true;

  return rule.byDay.includes(rruleWeekday(date, timeZone));
}
