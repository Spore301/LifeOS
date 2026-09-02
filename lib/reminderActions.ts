import { getTask, updateTask, deleteTask, completeTask } from './store/tasks';
import { Task, ReminderResponseInput, RescheduleMode } from './task-types';
import {
  markEventDone,
  markEventNeedsAction,
  writeTaskToGoogleCalendar,
  deleteTaskFromGoogleCalendar,
  fetchGoogleFreeBusy,
} from './calendar';
import { getAccessToken } from './google-auth';
import { calculateProposedSchedule } from './scheduler';
import { getTimeZone, zonedDayBounds, formatInZone } from './timezone';

/**
 * What a reminder button does.
 *
 * Every action here writes the task AND its calendar block in the same call.
 * That is the whole design: the user's action IS the sync, so the calendar and
 * the ledger cannot drift apart between them, and there is nothing to reconcile
 * afterwards. Previously no reminder action touched Google Calendar at all.
 */

export interface ReminderActionResult {
  task: Task | null;
  /** What happened on the calendar, in words the agent can repeat to the user. */
  calendar: string;
  /** Set when the scheduler chose the time, so the user can be told where it went. */
  newSlotLabel?: string;
  /** CANCEL is destructive, so it reports back instead of acting. */
  needsConfirmation?: boolean;
}

/** Fixed offsets, in minutes. 'agent' is handled separately. */
const OFFSETS: Record<Exclude<RescheduleMode, 'agent'>, number> = {
  '30m': 30,
  '1h': 60,
};

/**
 * Move a task's block, updating both sides together.
 * Returns the label for the new start so the caller can tell the user.
 */
async function moveTo(
  userId: string,
  task: Task,
  start: Date,
  token: string
): Promise<string> {
  const end = new Date(start.getTime() + (task.durationMinutes || 30) * 60_000);

  const updated = updateTask(userId, task.id, {
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    state: 'not_started',
    reminderAcknowledged: false,
    rescheduleCount: (task.rescheduleCount ?? 0) + 1,
  });

  if (token && updated) {
    // Upserts on task id, so the existing block moves rather than duplicating.
    await writeTaskToGoogleCalendar(token, {
      task: updated as any,
      slot: { start: start.toISOString(), end: end.toISOString() },
    });
  }

  return `${formatInZone(start, getTimeZone())} ${getTimeZone()}`;
}

/** Ask the scheduler for the next slot that actually fits this task today. */
async function nextFreeSlot(userId: string, task: Task, token: string): Promise<Date | null> {
  const timeZone = getTimeZone();
  const now = new Date();
  const { start, end } = zonedDayBounds(now, timeZone);

  const busy = token
    ? await fetchGoogleFreeBusy(token, start.toISOString(), end.toISOString())
    : [];

  const proposal = calculateProposedSchedule(
    [
      {
        id: task.id,
        title: task.title,
        durationMinutes: task.durationMinutes || 30,
        deadline: task.deadline,
        priority: task.priority,
        isBlocked: false,
        category: task.project,
        // Recurrence is intentionally omitted: the user is moving THIS instance,
        // and its rule would otherwise exclude today and place nothing.
      },
    ],
    busy,
    undefined,
    now,
    timeZone
  );

  const placed = proposal.scheduledTasks[0];
  return placed ? new Date(placed.slot.start) : null;
}

export async function applyReminderAction(
  userId: string,
  input: ReminderResponseInput & { confirmed?: boolean }
): Promise<ReminderActionResult> {
  const task = getTask(userId, input.taskId);
  if (!task) return { task: null, calendar: 'task not found' };

  const token = await getAccessToken(userId);

  switch (input.intent) {
    case 'DONE': {
      const updated = completeTask(userId, task.id, input.actualDurationMinutes);
      if (input.reason) updateTask(userId, task.id, { slipReason: input.reason });

      if (!token) return { task: updated, calendar: 'no calendar authorisation' };
      const patched = await markEventDone(token, task.id, task.title);
      return {
        task: getTask(userId, task.id),
        calendar: patched ? 'block marked DONE' : 'no block found to mark',
      };
    }

    case 'RESCHEDULE': {
      const mode: RescheduleMode = input.mode || 'agent';
      if (input.reason) updateTask(userId, task.id, { slipReason: input.reason });

      let start: Date | null;
      if (mode === 'agent') {
        start = await nextFreeSlot(userId, task, token);
        if (!start) {
          return {
            task,
            calendar: 'no free slot left today; the task is unscheduled and needs a decision',
          };
        }
      } else {
        // Offsets run from now, not from the old slot: "+30m" means half an hour
        // from when you pressed it, which is what the user means by it.
        start = new Date(Date.now() + OFFSETS[mode] * 60_000);
      }

      const label = await moveTo(userId, getTask(userId, task.id) || task, start, token);
      return {
        task: getTask(userId, task.id),
        calendar: token ? `block moved to ${label}` : 'no calendar authorisation',
        newSlotLabel: label,
      };
    }

    case 'CANCEL': {
      // Destructive and irreversible, so never act on the first press.
      if (!input.confirmed) {
        return {
          task,
          calendar: 'confirmation required before deleting',
          needsConfirmation: true,
        };
      }

      if (token) await deleteTaskFromGoogleCalendar(token, task.id);
      deleteTask(userId, task.id);
      return { task: null, calendar: 'task deleted and block removed' };
    }

    case 'ACK':
    default: {
      const updated = updateTask(userId, task.id, { reminderAcknowledged: true });
      return { task: updated, calendar: 'unchanged' };
    }
  }
}

/**
 * Tasks whose booked window has closed while they were still open.
 *
 * Derived, never stored: a flag would be one more thing that can be wrong, and
 * this is exactly `active && now > scheduledEnd`. Everything that needs to know
 * - the toast, the timeline highlight, the agent - computes it from the same
 * place, so they cannot disagree.
 */
export function overdueTasks(userId: string, tasks: Task[]): Task[] {
  const now = Date.now();
  return tasks.filter((t) => {
    if (t.state === 'done' || t.state === 'deferred') return false;
    if (!t.scheduledEnd) return false;
    return new Date(t.scheduledEnd).getTime() < now;
  });
}

/** Paint overdue blocks yellow so the "needs a decision" state is visible in Google Calendar too. */
export async function flagOverdueOnCalendar(userId: string, tasks: Task[]): Promise<number> {
  const token = await getAccessToken(userId);
  if (!token) return 0;

  let flagged = 0;
  for (const task of overdueTasks(userId, tasks)) {
    try {
      if (await markEventNeedsAction(token, task.id, task.title)) flagged += 1;
    } catch (err) {
      console.error(`[reminderActions] could not flag ${task.id}:`, err);
    }
  }
  return flagged;
}
