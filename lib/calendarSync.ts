import { getTasks, updateTask } from './store/tasks';
import { Task } from './task-types';
import {
  fetchGoogleFreeBusy,
  fetchGoogleCalendarEvents,
  writeTaskToGoogleCalendar,
  deleteTaskFromGoogleCalendar,
} from './calendar';
import { getAccessToken } from './google-auth';
import { calculateProposedSchedule } from './scheduler';
import { getTimeZone, zonedDayBounds } from './timezone';
import { isDueOn } from './recurrence';

/**
 * Keep Google Calendar matching the task ledger.
 *
 * Previously a schedule existed only as an ephemeral proposal: nothing recorded
 * WHEN a task was booked, so the moment a task changed the calendar drifted and
 * nothing could tell. Tasks now carry scheduledStart/scheduledEnd, and this
 * reconciles the two in one pass:
 *
 *   1. Roll over slots that finished without the task being done.
 *   2. Adopt still-future blocks the calendar already holds, so a day the user
 *      already agreed to is never silently rearranged.
 *   3. Place active, unscheduled tasks into today's remaining free time.
 *   4. Write every scheduled task (upsert, so a block moves rather than
 *      duplicating).
 *   5. Remove blocks for tasks that are deferred, blocked, unscheduled or gone.
 *      Completed tasks keep theirs: a finished slot is history, not litter.
 *
 * Deliberately conservative about movement: a task already holding a valid
 * future slot is never re-placed, so repeated syncs do not shuffle the day.
 */

export interface CalendarSyncResult {
  skipped?: string;
  rolledOver: string[];
  adopted: string[];
  scheduled: string[];
  written: number;
  removed: number;
}

/**
 * Cheap signature of the task ledger. Compared either side of a chat turn so a
 * conversation that changed nothing does not spend Google API calls, while any
 * create, edit, state change or deletion does trigger a sync.
 */
export function taskFingerprint(userId: string): string {
  return getTasks(userId)
    .map((t) => `${t.id}:${t.updatedAt}:${t.state}:${t.scheduledStart ?? ''}`)
    .sort()
    .join('|');
}

/** Tasks that should hold a calendar block right now. */
function isActive(t: Task): boolean {
  if (t.state === 'done' || t.state === 'deferred') return false;
  if (t.isBlocked || t.state === 'blocked') return false;
  return true;
}

export async function syncCalendar(userId: string): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    rolledOver: [],
    adopted: [],
    scheduled: [],
    written: 0,
    removed: 0,
  };

  const token = await getAccessToken(userId);
  if (!token) {
    result.skipped = 'no Google calendar authorisation';
    return result;
  }

  const timeZone = getTimeZone();
  const now = new Date();

  // --- 1. Roll over anything whose window closed without it being finished.
  for (const task of getTasks(userId)) {
    if (!task.scheduledEnd || !isActive(task)) continue;
    if (new Date(task.scheduledEnd).getTime() >= now.getTime()) continue;

    updateTask(userId, task.id, { scheduledStart: undefined, scheduledEnd: undefined });
    result.rolledOver.push(task.id);
  }

  const { start: dayStart, end: dayEnd } = zonedDayBounds(now, timeZone);

  // Read the calendar once; both the adopt step and the cleanup below need it.
  let events: Awaited<ReturnType<typeof fetchGoogleCalendarEvents>> = [];
  try {
    events = await fetchGoogleCalendarEvents(token, dayStart.toISOString(), dayEnd.toISOString());
  } catch (err) {
    console.error('[calendarSync] could not read calendar:', err);
    result.skipped = 'calendar read failed';
    return result;
  }

  const eventByTask = new Map<string, { start?: string; end?: string }>();
  for (const evt of events) {
    const id = evt.extendedProperties?.private?.lifeos_task_id;
    if (id && !eventByTask.has(id)) {
      eventByTask.set(id, { start: evt.start?.dateTime, end: evt.end?.dateTime });
    }
  }

  // --- 1b. Adopt existing blocks. A task booked on the calendar before the
  //         ledger tracked slots would otherwise look unscheduled and be moved
  //         somewhere new, silently rearranging a day the user already agreed to.
  //         The calendar wins here: it is what the user can see.
  for (const task of getTasks(userId)) {
    if (!isActive(task) || task.scheduledStart) continue;
    const existing = eventByTask.get(task.id);
    if (!existing?.start || !existing?.end) continue;
    // Never adopt a block that has already finished, or a task just rolled over
    // in step 1 would immediately reacquire the slot it failed to complete.
    if (new Date(existing.end).getTime() < now.getTime()) continue;

    updateTask(userId, task.id, {
      scheduledStart: existing.start,
      scheduledEnd: existing.end,
    });
    result.adopted.push(task.id);
  }

  // --- 2. Place active tasks that have no slot into today's remaining free time.
  const unplaced = getTasks(userId).filter(
    (t) => isActive(t) && !t.scheduledStart && isDueOn(t.recurrence, now, timeZone)
  );

  if (unplaced.length > 0) {
    const busy = await fetchGoogleFreeBusy(token, dayStart.toISOString(), dayEnd.toISOString());

    const proposal = calculateProposedSchedule(
      unplaced.map((t) => ({
        id: t.id,
        title: t.title,
        durationMinutes: t.durationMinutes || 30,
        deadline: t.deadline,
        priority: t.priority,
        isBlocked: false,
        category: t.project,
        recurrence: t.recurrence,
      })),
      busy,
      undefined,
      now,
      timeZone
    );

    for (const placed of proposal.scheduledTasks) {
      updateTask(userId, placed.task.id, {
        scheduledStart: placed.slot.start,
        scheduledEnd: placed.slot.end,
      });
      result.scheduled.push(placed.task.id);
    }
  }

  // --- 3. Write every scheduled task. writeTaskToGoogleCalendar upserts on task
  //        id, so an existing block moves instead of being duplicated.
  const finalTasks = getTasks(userId);
  for (const task of finalTasks) {
    if (!isActive(task) || !task.scheduledStart || !task.scheduledEnd) continue;
    try {
      await writeTaskToGoogleCalendar(token, {
        task: task as any,
        slot: { start: task.scheduledStart, end: task.scheduledEnd },
      });
      result.written += 1;
    } catch (err) {
      console.error(`[calendarSync] write failed for ${task.id}:`, err);
    }
  }

  // --- 4. Remove blocks that should no longer exist. Anything LifeOS put on the
  //        calendar whose task is now inactive, unscheduled, or deleted outright.
  const byId = new Map(finalTasks.map((t) => [t.id, t]));

  const seen = new Set<string>();
  for (const evt of events) {
    const taskId = evt.extendedProperties?.private?.lifeos_task_id;
    if (!taskId) continue;

    const task = byId.get(taskId);
    // A finished task keeps its block: a completed slot in the past is history,
    // not litter, and deleting it would erase the record of the day.
    const shouldKeep = task && isActive(task) && !!task.scheduledStart;

    if (!shouldKeep && task?.state !== 'done' && !seen.has(taskId)) {
      try {
        await deleteTaskFromGoogleCalendar(token, taskId);
        result.removed += 1;
      } catch (err) {
        console.error(`[calendarSync] delete failed for ${taskId}:`, err);
      }
    }
    seen.add(taskId);
  }

  return result;
}
