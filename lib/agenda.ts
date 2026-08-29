import { calculateProposedSchedule } from './scheduler';
import { getTasks } from './store/tasks';
import { Task as SchedulerTask, ProposedSchedule } from './types';
import { fetchGoogleFreeBusy, writeTaskToGoogleCalendar } from './calendar';
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

  const today = new Date();
  const timeMin = new Date(today).setHours(0, 0, 0, 0);
  const timeMax = new Date(today).setHours(23, 59, 59, 999);

  const busySlots = await fetchGoogleFreeBusy(
    token,
    new Date(timeMin).toISOString(),
    new Date(timeMax).toISOString()
  );

  const result = calculateProposedSchedule(tasks, busySlots);

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
    written.push(evt);
  }
  return {
    written,
    count: written.length,
    mocked: !token,
  };
}
