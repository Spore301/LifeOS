import { calculateProposedSchedule } from './scheduler';
import { getTasks, updateTask } from './store/tasks';
import { Task as SchedulerTask, ProposedSchedule } from './types';
import {
  fetchGoogleFreeBusy,
  fetchGoogleCalendarEvents,
  writeTaskToGoogleCalendar,
  deleteTaskFromGoogleCalendar,
} from './calendar';
import { getTimeZone, zonedDayBounds } from './timezone';
import { getAccessToken } from './google-auth';

/**
 * Agenda orchestration: convert the LifeOS task ledger into a concrete daily
 * schedule proposal, and (on user confirm) write events to Google Calendar.
 *
 * Scheduling rules distilled from docs/01 (Kahneman, Newport, Perlow, etc.):
 *  - Only schedule non-blocked, non-deferred tasks.
 *  - Respect work hours + existing free/busy.
 *  - Never fill 100%: the scheduler works on today's window; the day keeps slack
 *    because we only slot the user's stated tasks (not a synthetic 100% fill).
 */

function toSchedulerTasks(userId: string): SchedulerTask[] {
  return getTasks(userId)
    .filter((t) => t.state !== 'done' && t.state !== 'deferred')
    .map((t) => ({
      id: t.id,
      title: t.title,
      durationMinutes: t.durationMinutes || 30,
      deadline: t.deadline,
      priority: t.priority,
      isBlocked: t.isBlocked || t.state === 'blocked',
      blockerReason: t.blockerReason,
      category: t.project,
      recurrence: t.recurrence,
    }));
}

// Resolve the user's live Google access token from persisted credentials.
// This works for the OpenCode agent's server-side calls (no session cookie) because
// the token was persisted at sign-in. Refreshes automatically when expired.
function accessToken(userId: string): Promise<string> {
  return getAccessToken(userId);
}

export interface AgendaProposal {
  scheduled: ProposedSchedule['scheduledTasks'];
  unscheduled: ProposedSchedule['unscheduledTasks'];
  bumped: ProposedSchedule['bumpedTasks'];
  warnings: ProposedSchedule['conflictWarnings'];
  needsCalendarAuth: boolean;
}

/**
 * Compute a proposed schedule for the user's active tasks today.
 */
export async function proposeToday(userId: string): Promise<AgendaProposal> {
  const tasks = toSchedulerTasks(userId);
  const token = await accessToken(userId);

  const timeZone = getTimeZone();
  // The FreeBusy window is the user's calendar day, not the server's. setHours(0)
  // in a UTC container asked Google for 05:30 IST -> 05:29 IST the next morning.
  const { start: dayStart, end: dayEnd } = zonedDayBounds(new Date(), timeZone);

  const busySlots = await fetchGoogleFreeBusy(
    token,
    dayStart.toISOString(),
    dayEnd.toISOString()
  );

  const result = calculateProposedSchedule(tasks, busySlots, undefined, new Date(), timeZone);

  return {
    scheduled: result.scheduledTasks,
    unscheduled: result.unscheduledTasks,
    bumped: result.bumpedTasks,
    warnings: result.conflictWarnings,
    needsCalendarAuth: !token,
  };
}

/**
 * Write confirmed scheduled tasks to the user's Google Calendar.
 * Returns actual resulting events (or mock events when no token is configured).
 */
export async function confirmWrite(userId: string, scheduledTasks: ProposedSchedule['scheduledTasks']) {
  const token = await accessToken(userId);
  const written: any[] = [];
  for (const st of scheduledTasks) {
    const evt = await writeTaskToGoogleCalendar(token, {
      task: st.task,
      slot: st.slot,
    } as any);
    // Record the slot on the task as well as the calendar. Without this the
    // ledger has no idea when anything is booked, so nothing can later detect
    // that the two have drifted apart.
    updateTask(userId, st.task.id, {
      scheduledStart: st.slot.start,
      scheduledEnd: st.slot.end,
    });
    written.push(evt);
  }
  return {
    written,
    count: written.length,
    mocked: !token,
  };
}

export interface CalendarAnomaly {
  eventId?: string;
  taskId: string;
  summary?: string;
  start?: string;
  reason: string;
}

/**
 * Compare today's calendar against the task ledger and report blocks that should
 * not be there.
 *
 * A LifeOS event whose task has since been deleted or replaced stays on the
 * calendar but is invisible to planning, because the planner only looks at the
 * ledger. That is how a stale 9:00 AM block survived alongside its replacement
 * and read to the user as a duplicate. Completed tasks are deliberately NOT
 * flagged: a finished block in the past is legitimate history.
 */
export async function reconcileToday(userId: string) {
  const token = await accessToken(userId);
  if (!token) {
    return { mocked: true, anomalies: [] as CalendarAnomaly[], checked: 0 };
  }

  const timeZone = getTimeZone();
  const { start, end } = zonedDayBounds(new Date(), timeZone);
  const events = await fetchGoogleCalendarEvents(
    token,
    start.toISOString(),
    end.toISOString()
  );

  const byId = new Map(getTasks(userId).map((t) => [t.id, t]));
  const anomalies: CalendarAnomaly[] = [];
  const seen = new Map<string, number>();

  const managed = events.filter((e) => e.extendedProperties?.private?.lifeos_task_id);

  for (const evt of managed) {
    const taskId = evt.extendedProperties!.private!.lifeos_task_id as string;
    const entry: CalendarAnomaly = {
      eventId: evt.id,
      taskId,
      summary: evt.summary,
      start: evt.start?.dateTime || evt.start?.date,
      reason: '',
    };

    const count = (seen.get(taskId) || 0) + 1;
    seen.set(taskId, count);
    if (count > 1) {
      anomalies.push({ ...entry, reason: 'duplicate block for the same task' });
      continue;
    }

    const task = byId.get(taskId);
    if (!task) {
      anomalies.push({ ...entry, reason: 'task no longer exists in the ledger' });
    } else if (task.state === 'deferred') {
      anomalies.push({ ...entry, reason: 'task was deferred but still has a block' });
    } else if (task.isBlocked || task.state === 'blocked') {
      anomalies.push({ ...entry, reason: 'task is blocked but still has a block' });
    }
  }

  return { mocked: false, anomalies, checked: managed.length };
}

/**
 * Remove a task's block from Google Calendar (task dropped or rescheduled away).
 */
export async function removeFromCalendar(userId: string, taskId: string) {
  const token = await accessToken(userId);
  if (!token) return { removed: false, mocked: true };
  const removed = await deleteTaskFromGoogleCalendar(token, taskId);
  return { removed, mocked: false };
}
