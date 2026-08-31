import { CalendarEvent, ScheduledTask, TimeSlot, Task } from './types';
import { getTimeZone, rruleWeekday, zonedWallClock } from './timezone';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  if (!accessToken) {
    return generateMockCalendarEvents();
  }

  try {
    const url = `${GOOGLE_CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      console.error(`Google Calendar API error (${res.status}):`, await res.text());
      return generateMockCalendarEvents();
    }

    const data = await res.json();
    return (data.items || []).map((evt: any) => ({
      id: evt.id,
      summary: evt.summary || 'Busy block',
      description: evt.description,
      start: evt.start,
      end: evt.end,
      extendedProperties: evt.extendedProperties,
    }));
  } catch (error) {
    console.error('Failed to fetch Google Calendar events:', error);
    return generateMockCalendarEvents();
  }
}

export async function fetchGoogleFreeBusy(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<TimeSlot[]> {
  if (!accessToken) {
    const mockEvents = generateMockCalendarEvents();
    return mockEvents.map(e => ({
      start: e.start.dateTime || e.start.date!,
      end: e.end.dateTime || e.end.date!,
    }));
  }

  try {
    const res = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: 'primary' }],
      }),
    });

    if (!res.ok) {
      console.error('FreeBusy API error:', await res.text());
      const mockEvents = generateMockCalendarEvents();
      return mockEvents.map(e => ({
        start: e.start.dateTime || e.start.date!,
        end: e.end.dateTime || e.end.date!,
      }));
    }

    const data = await res.json();
    const busyList = data.calendars?.primary?.busy || [];
    return busyList.map((b: any) => ({
      start: b.start,
      end: b.end,
    }));
  } catch (err) {
    console.error('Failed to query FreeBusy:', err);
    return [];
  }
}

export async function writeTaskToGoogleCalendar(
  accessToken: string,
  scheduledTask: ScheduledTask
): Promise<CalendarEvent> {
  const { task, slot } = scheduledTask;

  const eventPayload = {
    summary: `[LifeOS] ${task.title}`,
    description: `Auto-scheduled by LifeOS AI assistant.\nPriority: ${task.priority.toUpperCase()}\nDuration: ${task.durationMinutes} mins`,
    start: {
      dateTime: slot.start,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: slot.end,
      timeZone: 'Asia/Kolkata',
    },
    recurrence: buildRecurrence(task, slot) || undefined,
    extendedProperties: {
      private: {
        lifeos_task_id: task.id,
        lifeos_priority: task.priority,
        lifeos_managed: 'true' as const,
        lifeos_blocker_status: task.isBlocked ? ('active' as const) : ('cleared' as const),
      },
    },
    colorId: getPriorityColorId(task.priority),
  };

  if (!accessToken) {
    console.log('[LifeOS Mock Write] Created Calendar Event:', eventPayload.summary, eventPayload.recurrence || '(one-off)');
    return {
      id: `mock-event-${Date.now()}`,
      summary: eventPayload.summary,
      description: eventPayload.description,
      start: eventPayload.start,
      end: eventPayload.end,
      recurrence: eventPayload.recurrence,
      extendedProperties: eventPayload.extendedProperties,
    };
  }

  // Upsert: a task already on the calendar gets its existing event MOVED, not cloned.
  // Without this, re-confirming a task after a time change left the old block behind
  // and the user had to delete duplicates by hand.
  const existingId = await findManagedEventId(accessToken, task.id);
  const url = existingId
    ? `${GOOGLE_CALENDAR_API}/calendars/primary/events/${encodeURIComponent(existingId)}`
    : `${GOOGLE_CALENDAR_API}/calendars/primary/events`;

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventPayload),
  });

  if (!res.ok) {
    throw new Error(`Google Calendar write failed: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    summary: data.summary,
    description: data.description,
    start: data.start,
    end: data.end,
    recurrence: data.recurrence,
    extendedProperties: data.extendedProperties,
  };
}

/**
 * Find the calendar event LifeOS already created for a task, if any.
 * Events are tagged with a private extended property at write time, so this
 * survives losing local state and works across devices.
 */
export async function findManagedEventId(
  accessToken: string,
  taskId: string
): Promise<string | null> {
  if (!accessToken || !taskId) return null;
  try {
    const prop = encodeURIComponent(`lifeos_task_id=${taskId}`);
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary/events?privateExtendedProperty=${prop}&showDeleted=false&maxResults=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.items || []).find((e: any) => e.status !== 'cancelled');
    return hit?.id || null;
  } catch {
    // Lookup is best-effort: on failure we fall back to creating a new event.
    return null;
  }
}

/** Remove the calendar block LifeOS created for a task. Returns true if one was deleted. */
export async function deleteTaskFromGoogleCalendar(
  accessToken: string,
  taskId: string
): Promise<boolean> {
  const eventId = await findManagedEventId(accessToken, taskId);
  if (!eventId) return false;
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  // 410 = already gone, which is the outcome the caller wanted anyway.
  if (!res.ok && res.status !== 410) {
    throw new Error(`Google Calendar delete failed: ${await res.text()}`);
  }
  return true;
}

const RRULE_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Build a Google Calendar recurrence array from a task's `recurrence` field.
 *   - 'weekly'  -> weekly on the same weekday/time as the scheduled slot.
 *   - 'RRULE:...' -> passed through verbatim.
 *   - otherwise -> no recurrence (undefined).
 */
function buildRecurrence(task: { recurrence?: string }, slot: { start?: string }): string[] | null {
  const rec = task.recurrence;
  if (!rec) return null;

  if (rec.startsWith('RRULE:')) {
    return [rec];
  }

  if (rec === 'weekly' && slot.start) {
    // Weekday as the USER sees it. getUTCDay() picks the wrong day for any slot
    // that straddles midnight UTC (e.g. a 07:00 IST block is 01:30 UTC the same
    // day, but a 23:00 IST block is the PREVIOUS day in UTC).
    const byday = rruleWeekday(new Date(slot.start), getTimeZone());
    return [`RRULE:FREQ=WEEKLY;BYDAY=${byday};COUNT=52`];
  }

  return null;
}

function getPriorityColorId(priority: string): string {
  switch (priority) {
    case 'urgent': return '11'; // Red
    case 'high': return '6';    // Orange
    case 'medium': return '5';  // Yellow
    default: return '9';       // Blue
  }
}

export function generateMockCalendarEvents(): CalendarEvent[] {
  const today = new Date();
  const tz = getTimeZone();
  
  const m1Start = zonedWallClock(today, 10, 0, tz);
  const m1End = zonedWallClock(today, 11, 0, tz);

  const m2Start = zonedWallClock(today, 13, 0, tz);
  const m2End = zonedWallClock(today, 13, 30, tz);

  const m3Start = zonedWallClock(today, 16, 0, tz);
  const m3End = zonedWallClock(today, 16, 30, tz);

  return [
    {
      id: 'evt-team-sync',
      summary: 'Team Standup & Sync',
      start: { dateTime: m1Start.toISOString() },
      end: { dateTime: m1End.toISOString() },
    },
    {
      id: 'evt-lunch',
      summary: 'Lunch Break',
      start: { dateTime: m2Start.toISOString() },
      end: { dateTime: m2End.toISOString() },
    },
    {
      id: 'evt-call-4pm',
      summary: 'Product Strategy Sync (4pm Call)',
      start: { dateTime: m3Start.toISOString() },
      end: { dateTime: m3End.toISOString() },
    },
  ];
}
